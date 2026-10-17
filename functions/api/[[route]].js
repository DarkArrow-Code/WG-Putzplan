import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

const app = new Hono().basePath('/api')

app.onError((err, c) => {
  console.error('Server error:', err)
  return c.json({ error: err.message || 'Server-Fehler', stack: err.stack }, 500)
})

let dbCleaned = false

async function cleanAndIndexDatabase(db) {
  if (dbCleaned) return
  try {
    // 1. Delete redundant duplicate entries in weekly_assignments grouped by (task_id, week_start_date, status) keeping only the minimum ID
    await db.prepare(`
      DELETE FROM weekly_assignments
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM weekly_assignments
        GROUP BY task_id, week_start_date, status
      )
    `).run()

    // 2. If there are still duplicates for the same task in the same week (e.g. one completed and one pending), delete the pending one
    await db.prepare(`
      DELETE FROM weekly_assignments
      WHERE status = 'pending'
      AND EXISTS (
        SELECT 1 FROM weekly_assignments a2
        WHERE a2.task_id = weekly_assignments.task_id
        AND a2.week_start_date = weekly_assignments.week_start_date
        AND a2.status = 'completed'
      )
    `).run()

    // 3. Delete any remaining duplicates for safety, keeping only one unique task entry per week
    await db.prepare(`
      DELETE FROM weekly_assignments
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM weekly_assignments
        GROUP BY task_id, week_start_date
      )
    `).run()

    // 4. Create the unique index to prevent future race conditions
    await db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_assignments_task_week 
      ON weekly_assignments (task_id, week_start_date)
    `).run()

    // 5. Add completed_at column if it doesn't exist
    try {
      await db.prepare('ALTER TABLE weekly_assignments ADD COLUMN completed_at TEXT').run()
    } catch (err) {
      // Ignore if column already exists
    }

    // 6. Server-side login sessions (token is only stored as SHA-256 hash)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `).run()

    // 7. Security codes received by mail (filled by the email worker)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS security_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        source TEXT,
        received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run()

    dbCleaned = true
  } catch (err) {
    console.error('Failed to clean database or create unique index:', err)
  }
}

// Middleware to verify D1 database binding exists
app.use('*', async (c, next) => {
  if (!c.env || !c.env.DB) {
    return c.json({
      error: 'D1-Datenbankbindung "DB" fehlt!',
      details: 'Bitte stelle sicher, dass du in den Cloudflare Pages-Einstellungen unter "Settings" -> "Functions" -> "D1 database bindings" eine D1-Datenbank mit dem Bindungsnamen "DB" verknüpft hast, und das Projekt danach neu gebaut/deployed hast.'
    }, 500)
  }
  await cleanAndIndexDatabase(c.env.DB)
  await next()
})

// Secure SHA-256 hashing using native Web Crypto API
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// --- Sessions ---

async function createSession(db, userId) {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  await db.prepare('INSERT INTO sessions (token_hash, user_id) VALUES (?, ?)')
    .bind(await sha256(token), userId).run()
  return token
}

// Only lets requests through that carry a valid login token
async function requireAuth(c, next) {
  const header = c.req.header('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return c.json({ error: 'Nicht eingeloggt' }, 401)

  const session = await c.env.DB.prepare(`
    SELECT s.user_id, u.name FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.created_at > datetime('now', '-90 days')
  `).bind(await sha256(token)).first()

  if (!session) return c.json({ error: 'Sitzung abgelaufen, bitte neu einloggen' }, 401)
  c.set('sessionUser', session)
  await next()
}

// --- TOTP (RFC 6238, same as Google/Microsoft Authenticator) ---

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const char of clean) {
    const idx = alphabet.indexOf(char)
    if (idx === -1) throw new Error('WG_TOTP_SECRET ist kein gültiger Base32-Schlüssel')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

async function generateTotp(secret, timestampMs = Date.now(), period = 30, digits = 6) {
  const counter = Math.floor(timestampMs / 1000 / period)
  const counterBytes = new Uint8Array(8)
  let tmp = counter
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = tmp & 0xff
    tmp = Math.floor(tmp / 256)
  }

  const key = await crypto.subtle.importKey(
    'raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  )
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes))
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3]

  const code = String(binary % 10 ** digits).padStart(digits, '0')
  const remaining = period - (Math.floor(timestampMs / 1000) % period)
  return { code, remaining, period }
}

async function ensureFiveUsers(db) {
  const { results: users } = await db.prepare('SELECT * FROM users').all()
  if (users.length < 5) {
    const missing = 5 - users.length
    for (let i = 0; i < missing; i++) {
      let placeholderName = ''
      let floor = 'OG1' // Default to OG1
      for (let j = 1; j <= 5; j++) {
        const name = `Mitbewohner ${j}`
        if (!users.some(u => u.name === name)) {
          placeholderName = name
          // 3 residents in OG1, 2 residents in OG2
          if (j === 4 || j === 5) floor = 'OG2'
          else floor = 'OG1'
          break
        }
      }
      if (!placeholderName) {
        placeholderName = `Mitbewohner ${Date.now()}`
      }
      // Insert placeholder without password
      await db.prepare('INSERT INTO users (name, is_setup, floor) VALUES (?, 0, ?)')
        .bind(placeholderName, floor).run()
      // Push to local array to avoid duplicate name insertion in next iteration of the loop
      users.push({ name: placeholderName, is_setup: 0, floor: floor })
    }
  }
}

app.get('/users', async (c) => {
  await ensureFiveUsers(c.env.DB)
  const { results } = await c.env.DB.prepare('SELECT id, name, is_setup, floor FROM users').all()
  return c.json(results)
})

app.post('/login', async (c) => {
  const { name, password } = await c.req.json()
  
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE name = ?').bind(name).first()
  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  const hashedPassword = await sha256(password)

  if (!user.is_setup) {
    // First time setup - hash and set password
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, is_setup = 1 WHERE id = ?')
      .bind(hashedPassword, user.id).run()
    
    const token = await createSession(c.env.DB, user.id)
    return c.json({ message: 'Password set successfully', token, user: { id: user.id, name: user.name, floor: user.floor } })
  }

  if (user.password_hash !== hashedPassword) {
    return c.json({ error: 'Ungültiges Passwort' }, 401)
  }

  const token = await createSession(c.env.DB, user.id)
  return c.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, floor: user.floor } })
})

// Register a new user (take over a placeholder)
app.post('/register', async (c) => {
  const { name, password, floor } = await c.req.json()
  
  if (!name || !password || !floor) return c.json({ error: 'Name, Passwort und Stockwerk sind erforderlich' }, 400)

  await ensureFiveUsers(c.env.DB)

  let placeholder = null

  // Check if name already exists
  const existingUser = await c.env.DB.prepare('SELECT id, is_setup FROM users WHERE name = ?').bind(name).first()
  if (existingUser) {
    if (existingUser.is_setup) {
      return c.json({ error: 'Dieser Name existiert bereits' }, 400)
    } else {
      // If it exists as an unconfigured placeholder, claim this specific one
      placeholder = existingUser
    }
  }

  if (!placeholder) {
    // Find the first placeholder in the specified floor to take over
    placeholder = await c.env.DB.prepare('SELECT id FROM users WHERE is_setup = 0 AND floor = ?').bind(floor).first()
    
    // Fallback to any placeholder if none in target floor
    if (!placeholder) {
      placeholder = await c.env.DB.prepare('SELECT id FROM users WHERE is_setup = 0').first()
    }
  }

  if (!placeholder) {
    return c.json({ error: 'Die WG ist voll (Maximal 5 Mitbewohner)' }, 400)
  }

  const hashedPassword = await sha256(password)

  // Update placeholder using safe .run() + subsequent .first() SELECT
  await c.env.DB.prepare(
    'UPDATE users SET name = ?, password_hash = ?, is_setup = 1, floor = ? WHERE id = ?'
  ).bind(name, hashedPassword, floor, placeholder.id).run()

  const result = await c.env.DB.prepare('SELECT id, name, floor FROM users WHERE id = ?').bind(placeholder.id).first()

  const token = await createSession(c.env.DB, result.id)
  return c.json({ message: 'Registered successfully', token, user: { id: result.id, name: result.name, floor: result.floor } })
})

app.post('/logout', async (c) => {
  const header = c.req.header('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  }
  return c.json({ success: true })
})

// --- WG-Mail Sicherheitscode (nur für eingeloggte Mitbewohner) ---

const MAIL_CODE_MAX_AGE_MINUTES = 15

app.get('/wg-code', requireAuth, async (c) => {
  let totp = null
  let totpError = null
  if (c.env.WG_TOTP_SECRET) {
    try {
      totp = await generateTotp(c.env.WG_TOTP_SECRET)
    } catch (err) {
      totpError = err.message
    }
  }

  // Housekeeping: codes older than one day are useless
  await c.env.DB.prepare("DELETE FROM security_codes WHERE received_at < datetime('now', '-1 day')").run()

  const mail = await c.env.DB.prepare(`
    SELECT code, source, received_at FROM security_codes
    WHERE received_at > datetime('now', ?)
    ORDER BY received_at DESC, id DESC
    LIMIT 1
  `).bind(`-${MAIL_CODE_MAX_AGE_MINUTES} minutes`).first()

  c.header('Cache-Control', 'no-store')
  return c.json({
    totp,
    totpConfigured: Boolean(c.env.WG_TOTP_SECRET),
    totpError,
    mail: mail || null,
    mailMaxAgeMinutes: MAIL_CODE_MAX_AGE_MINUTES
  })
})

// Get all task templates
app.get('/tasks', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM task_templates ORDER BY type DESC, default_priority ASC').all()
  return c.json(results)
})

// Create a new task template
app.post('/tasks', async (c) => {
  const { title, description, type, default_priority, floor_restriction } = await c.req.json()
  
  const insertResult = await c.env.DB.prepare(
    'INSERT INTO task_templates (title, description, type, default_priority, floor_restriction) VALUES (?, ?, ?, ?, ?)'
  ).bind(title, description || '', type || 'weekly', default_priority || 5, floor_restriction || null).run()

  const result = await c.env.DB.prepare('SELECT * FROM task_templates WHERE id = ?').bind(insertResult.meta.last_row_id).first()

  return c.json(result, 201)
})

// Update a task template
app.put('/tasks/:id', async (c) => {
  const id = c.req.param('id')
  const { title, description, type, default_priority, floor_restriction } = await c.req.json()
  
  await c.env.DB.prepare(
    'UPDATE task_templates SET title = ?, description = ?, type = ?, default_priority = ?, floor_restriction = ? WHERE id = ?'
  ).bind(title, description, type, default_priority, floor_restriction || null, id).run()

  const result = await c.env.DB.prepare('SELECT * FROM task_templates WHERE id = ?').bind(id).first()

  return c.json(result)
})

// Delete a task template
app.delete('/tasks/:id', async (c) => {
  const id = c.req.param('id')
  // First delete any weekly assignments referencing this task to avoid foreign key constraints
  await c.env.DB.prepare('DELETE FROM weekly_assignments WHERE task_id = ?').bind(id).run()
  // Then delete the task template
  await c.env.DB.prepare('DELETE FROM task_templates WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// --- Absences ---

// Get absences for a user
app.get('/absences', async (c) => {
  // Clean up old absences (ended > 14 days ago)
  await c.env.DB.prepare("DELETE FROM absences WHERE date(end_date) < date('now', '-14 days')").run()

  const userId = c.req.query('user_id')
  let results
  
  if (userId) {
    const data = await c.env.DB.prepare(`
      SELECT a.*, u.name as user_name
      FROM absences a
      JOIN users u ON a.user_id = u.id
      WHERE a.user_id = ?
      ORDER BY a.start_date ASC
    `).bind(userId).all()
    results = data.results
  } else {
    const data = await c.env.DB.prepare(`
      SELECT a.*, u.name as user_name
      FROM absences a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.start_date ASC
    `).all()
    results = data.results
  }
  
  return c.json(results)
})

// Create an absence
app.post('/absences', async (c) => {
  const { user_id, start_date, end_date } = await c.req.json()
  
  const insertResult = await c.env.DB.prepare(
    'INSERT INTO absences (user_id, start_date, end_date) VALUES (?, ?, ?)'
  ).bind(user_id, start_date, end_date).run()

  const result = await c.env.DB.prepare(`
    SELECT a.*, u.name as user_name
    FROM absences a
    JOIN users u ON a.user_id = u.id
    WHERE a.id = ?
  `).bind(insertResult.meta.last_row_id).first()

  return c.json(result, 201)
})

// Delete an absence
app.delete('/absences/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM absences WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// --- Assignments ---

function getMonday(d) {
  d = new Date(d);
  var day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

app.post('/assignments/generate', async (c) => {
  await ensureFiveUsers(c.env.DB);
  const weekStart = getMonday(new Date());
  
  // Check if already generated
  const existing = await c.env.DB.prepare(`
    SELECT a.*, t.title, t.description, t.type, u.name as user_name
    FROM weekly_assignments a
    JOIN task_templates t ON a.task_id = t.id
    JOIN users u ON a.user_id = u.id
    WHERE a.week_start_date = ?
    ORDER BY a.current_priority ASC
  `).bind(weekStart).all();
  if (existing.results.length > 0) {
    return c.json(existing.results);
  }

  const { results: users } = await c.env.DB.prepare('SELECT id, name, floor FROM users').all();
  const { results: tasks } = await c.env.DB.prepare('SELECT * FROM task_templates').all();

  let monday = new Date(weekStart);
  let sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekEndStr = sunday.toISOString().split('T')[0];

  const { results: absences } = await c.env.DB.prepare('SELECT * FROM absences WHERE start_date <= ? AND end_date >= ?').bind(weekEndStr, weekStart).all();

  // Exclude users who are absent for 3 or more days this week
  let availableUsers = users.map(u => ({ id: u.id, name: u.name, floor: u.floor }));
  for (const abs of absences) {
    const start = new Date(Math.max(new Date(abs.start_date).getTime(), new Date(weekStart).getTime()));
    const end = new Date(Math.min(new Date(abs.end_date).getTime(), new Date(weekEndStr).getTime()));
    const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (days >= 3) {
      availableUsers = availableUsers.filter(u => u.id !== abs.user_id);
    }
  }

  const weekNum = Math.floor(new Date(weekStart).getTime() / (7 * 24 * 60 * 60 * 1000));
  const assignments = [];
  const assignedUserIds = new Set();

  // Helper function to safely insert assignment and retrieve it
  const addAssignment = async (taskId, userId, priority) => {
    try {
      const insertResult = await c.env.DB.prepare(
        'INSERT INTO weekly_assignments (task_id, user_id, week_start_date, current_priority) VALUES (?, ?, ?, ?)'
      ).bind(taskId, userId, weekStart, priority).run();
      
      const result = await c.env.DB.prepare(`
        SELECT a.*, t.title, t.description, t.type, u.name as user_name
        FROM weekly_assignments a
        JOIN task_templates t ON a.task_id = t.id
        JOIN users u ON a.user_id = u.id
        WHERE a.id = ?
      `).bind(insertResult.meta.last_row_id).first();
      
      assignments.push(result);
      assignedUserIds.add(userId);
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        console.log(`Assignment for task ${taskId} already exists for week ${weekStart}. Skipping.`);
      } else {
        throw err;
      }
    }
  };

  // 1. OG2 Bathroom Task (2 residents) - Perfect 4-week cycle to alternate bathroom and shower duty fairly
  const og2Users = availableUsers.filter(u => u.floor === 'OG2');
  og2Users.sort((a, b) => a.id - b.id);
  
  if (og2Users.length > 0) {
    let selectedUser = null;
    let taskTitle = '';
    
    if (og2Users.length === 2) {
      const index = weekNum % 4;
      if (index === 0) {
        selectedUser = og2Users[0];
        taskTitle = 'Bad OG2 Spezial (inkl. Dusche & Spiegel)';
      } else if (index === 1) {
        selectedUser = og2Users[1];
        taskTitle = 'Bad OG2 (Klo & Waschbecken)';
      } else if (index === 2) {
        selectedUser = og2Users[1];
        taskTitle = 'Bad OG2 Spezial (inkl. Dusche & Spiegel)';
      } else {
        selectedUser = og2Users[0];
        taskTitle = 'Bad OG2 (Klo & Waschbecken)';
      }
    } else {
      // Only 1 OG2 resident is available this week (e.g. other is absent)
      selectedUser = og2Users[0];
      // Alternate task type for the remaining user
      taskTitle = (weekNum % 2 === 0)
        ? 'Bad OG2 Spezial (inkl. Dusche & Spiegel)'
        : 'Bad OG2 (Klo & Waschbecken)';
    }

    const task = tasks.find(t => t.title === taskTitle);
    if (task && selectedUser) {
      await addAssignment(task.id, selectedUser.id, task.default_priority);
    }
  }

  // 2. OG1 Bathroom Task (3 residents) - Rotate among OG1 residents, alternating shower specialty every 2 weeks
  const og1Users = availableUsers.filter(u => u.floor === 'OG1');
  og1Users.sort((a, b) => a.id - b.id);

  if (og1Users.length > 0) {
    const selectedUser = og1Users[weekNum % og1Users.length];
    const isShowerWeek = (weekNum % 2 === 0);
    const taskTitle = isShowerWeek 
      ? 'Bad OG1 Spezial (inkl. Dusche & Spiegel)' 
      : 'Bad OG1 (Klo & Waschbecken)';

    const task = tasks.find(t => t.title === taskTitle);
    if (task && selectedUser) {
      await addAssignment(task.id, selectedUser.id, task.default_priority);
    }
  }

  // 3. General weekly tasks (Priority 2) - Assigned to remaining users who don't have bathroom duty
  const remainingUsers = availableUsers.filter(u => !assignedUserIds.has(u.id));
  remainingUsers.sort((a, b) => a.id - b.id);

  const generalWeeklyTasks = tasks.filter(t => t.type === 'weekly' && t.default_priority === 2);
  generalWeeklyTasks.sort((a, b) => a.id - b.id);

  if (remainingUsers.length > 0) {
    for (let i = 0; i < generalWeeklyTasks.length; i++) {
      if (i >= remainingUsers.length) break;
      
      const task = generalWeeklyTasks[i];
      // Rotate who gets which general task
      const selectedUser = remainingUsers[(weekNum + i) % remainingUsers.length];
      await addAssignment(task.id, selectedUser.id, task.default_priority);
    }
  }

  // 4. Monthly tasks (Priority 3) - Exactly 1 monthly task active per week of the month, rotating among all residents
  const date = new Date(weekStart);
  const day = date.getDate();
  const weekOfMonth = Math.ceil(day / 7); // 1, 2, 3, 4, 5

  if (weekOfMonth >= 1 && weekOfMonth <= 4 && availableUsers.length > 0) {
    const monthlyTasks = tasks.filter(t => t.type === 'monthly');
    monthlyTasks.sort((a, b) => a.id - b.id);

    const taskIndex = weekOfMonth - 1;
    if (taskIndex < monthlyTasks.length) {
      const task = monthlyTasks[taskIndex];
      
      // Rotate monthly workload across all available residents
      availableUsers.sort((a, b) => a.id - b.id);
      const selectedUser = availableUsers[(weekNum + weekOfMonth) % availableUsers.length];

      await addAssignment(task.id, selectedUser.id, task.default_priority);
    }
  }

  // Query and return the final assignments for this week from the DB
  const { results: finalAssignments } = await c.env.DB.prepare(`
    SELECT a.*, t.title, t.description, t.type, u.name as user_name
    FROM weekly_assignments a
    JOIN task_templates t ON a.task_id = t.id
    JOIN users u ON a.user_id = u.id
    WHERE a.week_start_date = ?
    ORDER BY a.current_priority ASC
  `).bind(weekStart).all();

  return c.json(finalAssignments, 201);
})

app.get('/assignments', async (c) => {
  const weekStart = getMonday(new Date());
  const { results } = await c.env.DB.prepare(`
    SELECT a.*, t.title, t.description, t.type, u.name as user_name
    FROM weekly_assignments a
    JOIN task_templates t ON a.task_id = t.id
    JOIN users u ON a.user_id = u.id
    WHERE a.week_start_date = ?
    ORDER BY a.current_priority ASC
  `).bind(weekStart).all();
  return c.json(results);
})

app.post('/assignments/:id/complete', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare("UPDATE weekly_assignments SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  return c.json({ success: true });
})

app.get('/admin/logs', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT a.*, t.title, u.name as user_name
    FROM weekly_assignments a
    JOIN task_templates t ON a.task_id = t.id
    JOIN users u ON a.user_id = u.id
    WHERE a.status = 'completed' AND a.completed_at IS NOT NULL
    ORDER BY a.completed_at DESC
    LIMIT 50
  `).all();
  return c.json(results);
})

app.post('/assignments/reassign', async (c) => {
  const { user_id } = await c.req.json();
  const weekStart = getMonday(new Date());

  // 1. Find user's current task
  const userTask = await c.env.DB.prepare('SELECT * FROM weekly_assignments WHERE user_id = ? AND week_start_date = ? AND status != "completed"').bind(user_id, weekStart).first();
  if (!userTask) return c.json({ error: 'No task to reassign' }, 400);

  // 2. Find all other pending tasks this week
  const { results: otherTasks } = await c.env.DB.prepare('SELECT * FROM weekly_assignments WHERE user_id != ? AND week_start_date = ? AND status != "completed" ORDER BY current_priority DESC').bind(user_id, weekStart).all();
  
  if (otherTasks.length > 0) {
    const lowestPrioTask = otherTasks[0];
    
    // Check if the user's task is MORE important than the lowest prio task
    if (userTask.current_priority <= lowestPrioTask.current_priority) {
      await c.env.DB.prepare('UPDATE weekly_assignments SET user_id = ? WHERE id = ?').bind(lowestPrioTask.user_id, userTask.id).run();
      await c.env.DB.prepare('DELETE FROM weekly_assignments WHERE id = ?').bind(lowestPrioTask.id).run();
      await c.env.DB.prepare('UPDATE task_templates SET default_priority = 1 WHERE id = ?').bind(lowestPrioTask.task_id).run();
      
      return c.json({ success: true, message: 'Reassigned successfully' });
    }
  }

  await c.env.DB.prepare('DELETE FROM weekly_assignments WHERE id = ?').bind(userTask.id).run();
  await c.env.DB.prepare('UPDATE task_templates SET default_priority = 1 WHERE id = ?').bind(userTask.task_id).run();

  return c.json({ success: true, message: 'Task dropped and priority increased' });
})

export const onRequest = handle(app)
