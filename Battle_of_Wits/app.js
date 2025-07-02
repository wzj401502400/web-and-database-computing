var express = require('express');
require('dotenv').config();
const xss = require('xss-clean');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const session = require('express-session');
var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();
app.use(express.json());
app.use(xss());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));
var mysql = require('mysql2');
var bcrypt = require('bcrypt');

var dbConnectionPool = mysql.createPool({
  host: process.env.DB_HOST,
  password: process.env.DB_PASS,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  dateStrings: true
});

// Test database connection
dbConnectionPool.getConnection((err, connection) => {
  if (err) {
    console.error('MySQL connection failed:', err.message);
  } else {
    console.log('MySQL connection successful!');
    connection.release();
  }
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const password_hash = await bcrypt.hash(password, 10);

  dbConnectionPool.getConnection((err, connection) => {
    if (err) return res.status(500).send('database connection failed');

    connection.beginTransaction(async (err) => {
      if (err) {
        connection.release();
        return res.status(500).send('transaction failed');
      }

      try {
        // First insert the user
        const userQuery = 'INSERT INTO Users (username, password_hash) VALUES (?, ?)';
        connection.query(userQuery, [username, password_hash], async (err, results) => {
          if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
              connection.rollback(() => {
                connection.release();
                return res.status(400).send('username exists');
              });
              return;
            }
            connection.rollback(() => {
              connection.release();
              return res.status(500).send('register failed');
            });
            return;
          }

          const userId = results.insertId;

          // Then create the player profile with default email
          const playerQuery = `
            INSERT INTO Players (
              user_id,
              email,
              current_level,
              reward_points
            ) VALUES (
              ?,
              ?,
              1,
              0
            )`;

          connection.query(playerQuery, [
            userId,
            `${username}@example.com`
          ], (err) => {
            if (err) {
              connection.rollback(() => {
                connection.release();
                console.error('Player creation error:', err);
                return res.status(500).send('player creation failed');
              });
              return;
            }

            connection.commit((err) => {
              if (err) {
                connection.rollback(() => {
                  connection.release();
                  return res.status(500).send('commit failed');
                });
                return;
              }
              connection.release();
              return res.send('register success');
            });
          });
        });
      } catch (err) {
        connection.rollback(() => {
          connection.release();
          return res.status(500).send('register process failed');
        });
      }
    });
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  const query = 'SELECT * FROM Users WHERE username = ?';
  dbConnectionPool.query(query, [username], async (err, results) => {
    if (err) {
      res.status(500).send('database error');
      return;
    }

    if (results.length === 0) {
      res.status(401).send('username not found');
      return;
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (match) {
      req.session.user = {
        user_id: user.user_id,
        username: user.username,
        role: user.role
      };
      res.send('login success');
    } else {
      res.status(401).send('password incorrect');
    }
  });
});

app.get('/check-login', (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, username: req.session.user.username });
  } else {
    res.status(401).json({ loggedIn: false });
  }
});

app.use(function (req, res, next) {
  req.pool = dbConnectionPool;
  next();
});

function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Administrator only');
  }
  next();
}

app.get('/admin', isAdmin, (req, res) => {
  res.send(`Welcome Admin: ${req.session.user.username}`);
});



app.get('/api/player_id', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const userId = req.session.user.user_id;
  const sql = 'SELECT player_id FROM Players WHERE user_id = ?';

  req.pool.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'Player not found' });

    return res.json({ player_id: results[0].player_id });
  });
});



app.get('/api/player/:id', (req, res) => {
  const playerId = req.params.id;
  const sql = 'SELECT * FROM Players WHERE player_id = ?';

  req.pool.query(sql, [playerId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'Player not found' });

    return res.json(results[0]);
  });
});


app.post('/api/player/:id', async (req, res) => {
  const playerId = req.params.id;
  const {
    given_name, family_name, country, address, introduction, email
  } = req.body;

  const sql = `
    INSERT INTO Players (
      player_id, user_id, email, given_name, family_name, country, address, introduction
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON DUPLICATE KEY UPDATE
      email = VALUES(email),
      given_name = VALUES(given_name),
      family_name = VALUES(family_name),
      country = VALUES(country),
      address = VALUES(address),
      introduction = VALUES(introduction)
  `;

  const userId = req.session.user && req.session.user.user_id;
  if (!userId) return res.status(401).json({ error: 'Not logged in' });

  req.pool.query(sql, [
    playerId, userId, email, given_name, family_name, country, address, introduction
  ], (err) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Insert or update failed' });
    }
    return res.json({ message: 'Profile saved' });
  });
});

app.get('/api/achievements', (req, res) => {
    const sql = 'SELECT * FROM Achievements';
    req.pool.query(sql, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results || []);
    });
});

app.get('/api/player/:id/achievements', (req, res) => {
    const playerId = req.params.id;
    const sql = `
        SELECT
            a.*,
            pa.unlock_time
        FROM Achievements a
        JOIN PlayerAchievements pa ON a.achievement_id = pa.achievement_id
        WHERE pa.player_id = ?
        ORDER BY pa.unlock_time DESC`;

    req.pool.query(sql, [playerId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

function queryAsync(pool, sql, params) {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

async function grant(pool, playerId, achievementId, unlockedNow) {
  await queryAsync(
    pool,
    'INSERT IGNORE INTO PlayerAchievements (player_id, achievement_id) VALUES (?, ?)',
    [playerId, achievementId]
  );
  unlockedNow.push(achievementId);
}

async function checkAchievements(req, playerId, sessionId) {
  const { pool } = req;
  const unlockedNow = [];
  const unlockedRows = await queryAsync(
    pool,
    'SELECT achievement_id FROM PlayerAchievements WHERE player_id = ?',
    [playerId]
  );
  const unlocked = new Set(unlockedRows.map(r => r.achievement_id));

 if (!unlocked.has(1) && sessionId) {
  await grant(pool, playerId, 1, unlockedNow);
}

  if (!unlocked.has(2)) {
    const rows = await queryAsync(
      pool,
      'SELECT COUNT(DISTINCT category_id) AS count FROM GameSessions WHERE player_id = ?',
      [playerId]
    );
    if (rows[0].count >= 5) await grant(pool, playerId, 2, unlockedNow);
  }

  if (!unlocked.has(3)) {
    const rows = await queryAsync(
      pool,
      'SELECT COUNT(*) AS count FROM GlobalChatMessages WHERE player_id = ?',
      [playerId]
    );
    if (rows[0].count >= 10) await grant(pool, playerId, 3, unlockedNow);
  }

  if (!unlocked.has(4)) {
    const rows = await queryAsync(
      pool,
      'SELECT MAX(unlocked_level) AS max FROM UnlockedLevels WHERE player_id = ?',
      [playerId]
    );
    if (rows[0].max >= 5) await grant(pool, playerId, 4, unlockedNow);
  }

  if (!unlocked.has(5)) {
    const rows = await queryAsync(
      pool,
      `SELECT COUNT(*) AS count
       FROM UnlockedLevels
       WHERE player_id = ? AND category_id > 0 AND unlocked_level >= 3`,
      [playerId]
    );
    if (rows[0].count >= 3) await grant(pool, playerId, 5, unlockedNow);
  }

  if (!unlocked.has(6) && unlocked.size + unlockedNow.length >= 5) {
    await grant(pool, playerId, 6, unlockedNow);
  }

  if (!unlocked.has(7)) {
    const rows = await queryAsync(
      pool,
      'SELECT COUNT(*) AS total FROM GameSessions WHERE player_id = ?',
      [playerId]
    );
    if (rows[0].total >= 30) await grant(pool, playerId, 7, unlockedNow);
  }

  if (!unlocked.has(8)) {
    const rows = await queryAsync(
      pool,
      'SELECT MAX(unlocked_level) AS max FROM UnlockedLevels WHERE player_id = ?',
      [playerId]
    );
    if (rows[0].max >= 10) await grant(pool, playerId, 8, unlockedNow);
  }

  if (!unlocked.has(9) && sessionId) {
    const rows = await queryAsync(
      pool,
      'SELECT time_used FROM GameSessions WHERE session_id = ? AND player_id = ?',
      [sessionId, playerId]
    );
    if (rows.length > 0 && rows[0].time_used <= 20) {
      await grant(pool, playerId, 9, unlockedNow);
    }
  }

  if (!unlocked.has(10) && sessionId) {
   const rows = await queryAsync(
  pool,
  `SELECT score FROM GameSessions WHERE session_id = ?`,
  [sessionId]
  );
    if (rows[0].score === 1) await grant(pool, playerId, 10, unlockedNow);
  }

  return unlockedNow;
}

app.post('/api/check-achievements', async (req, res) => {
  const { playerId, sessionId } = req.body;
  try {
    const unlockedNow = await checkAchievements(req, playerId, sessionId);
    res.json(unlockedNow);
  } catch (err) {
    console.error('Achievement check error:', err);
    res.status(500).json({ error: 'Failed to check achievements' });
  }
});

app.post('/api/player-stats/update', (req, res) => {
    // Check login status
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    // Extract and validate request data
    const { score = 0, gameTime = 0, totalGame = 1, win = false } = req.body;
    if (typeof score !== 'number' || typeof gameTime !== 'number') {
        return res.status(400).json({ error: 'Invalid score or gameTime' });
    }

    // Get player ID
    req.pool.query(
        'SELECT player_id FROM Players WHERE user_id = ?',
        [req.session.user.user_id],
        (err, results) => {
            if (err) {
                console.error('Error getting player ID:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!results || results.length === 0) {
                return res.status(404).json({ error: 'Player not found' });
            }

            const playerId = results[0].player_id;

            // Update player stats
            const updateStats = `
                INSERT INTO PlayerStats (player_id, total_score, game_time, total_games)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    total_score = total_score + VALUES(total_score),
                    game_time = game_time + VALUES(game_time),
                    total_games = total_games + 1`;

            req.pool.query(updateStats, [playerId, score, gameTime, totalGame], (err) => {
                if (err) {
                    console.error('Error updating stats:', err);
                    return res.status(500).json({ error: 'Failed to update stats' });
                }

                // If successful, return the updated stats
                res.json({
                    message: 'Stats updated successfully',
                    stats: {
                        playerId,
                        score,
                        gameTime,
                        totalGame
                    }
                });
            });
        }
    );
});

app.get('/api/player-stats', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not logged in' });
    }
    // Get player ID
    req.pool.query(
        'SELECT player_id FROM Players WHERE user_id = ?',
        [req.session.user.user_id],
        (err, results) => {
            if (err) {
                console.error('Error getting player ID:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!results || results.length === 0) {
                return res.status(404).json({ error: 'Player not found' });
            }

            const playerId = results[0].player_id;
            // Get player stats
            req.pool.query(
                'SELECT * FROM PlayerStats WHERE player_id = ?',
                [playerId],
                (err, stats) => {
                    if (err) {
                        console.error('Error getting stats:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    res.json(stats[0] || {
                        total_score: 0,
                        player_rank: 'Beginner',
                        game_time: 0,
                        total_games: 0
                    });
                }
            );
        }
    );
});

app.get('/api/chat/messages', (req, res) => {
  const sql = `
    SELECT
      m.message_id,
      m.content,
      m.timestamp,
      m.player_id,
      p.given_name,
      u.username
    FROM GlobalChatMessages m
    JOIN Players p ON m.player_id = p.player_id
    JOIN Users u ON p.user_id = u.user_id
    ORDER BY m.timestamp DESC
    LIMIT 50
  `;

  req.pool.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching messages:', err);
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }
    res.json(results.reverse());
  });
});

// Send message endpoint
app.post('/api/chat/messages', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  req.pool.query(
    'SELECT player_id FROM Players WHERE user_id = ?',
    [req.session.user.user_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'Player not found' });
      }

      const playerId = results[0].player_id;

      req.pool.query(
        'INSERT INTO GlobalChatMessages (player_id, content) VALUES (?, ?)',
        [playerId, content],
        (err, insertResult) => {
          if (err) return res.status(500).json({ error: 'Insert failed' });
          checkAchievements(req, playerId, null)
            .then(unlockedNow => {
              res.json({
                message: 'Message sent successfully',
                messageId: insertResult.insertId,
                unlockedAchievements: unlockedNow
              });
            })
            .catch(err => {
              console.error('Achievement check error:', err);
              res.json({
                message: 'Message sent successfully',
                messageId: insertResult.insertId,
                unlockedAchievements: []
              });
            });
        }
      );
    }
  );
});

// Create new game session
app.post('/api/game-session', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    const { game_mode, category_id, level } = req.body;

    // First get player_id
    req.pool.query(
        'SELECT player_id FROM Players WHERE user_id = ?',
        [req.session.user.user_id],
        (err, results) => {
            if (err) {
                console.error('Error getting player:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!results.length) {
                return res.status(404).json({ error: 'Player not found' });
            }

            const playerId = results[0].player_id;

req.pool.query(
    `INSERT INTO GameSessions (player_id, game_mode, category_id, level, score, time_used, status)
     VALUES (?, ?, ?, ?, 0, 0, 'active')`,
    [
        playerId,
        'single',
        game_mode === 'random' ? 0 : (category_id || 0),
        level || 1
    ],
    (err, result) => {
        if (err) {
            console.error('Error creating session:', err);
            return res.status(500).json({ error: 'Failed to create game session' });
        }

        res.json({
            message: 'Game session created',
            session_id: result.insertId,
            game_mode: 'single',
            category_id: game_mode === 'random' ? 0 : (category_id || 0),
            level: level || 1
        });
    }
);
        }
    );
});

// Update game session status
app.put('/api/game-session/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    const { status, score, time_used } = req.body;
    const session_id = req.params.id;

    req.pool.query(
        `SELECT gs.* FROM GameSessions gs
         JOIN Players p ON gs.player_id = p.player_id
         WHERE gs.session_id = ? AND p.user_id = ?`,
        [session_id, req.session.user.user_id],
        (err, results) => {
            if (err || !results.length) {
                return res.status(403).json({ error: 'Session not found or unauthorized' });
            }

            const validStatuses = ['completed', 'failed'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }

            let finalStatus = status;
            if (status === 'completed') {
              finalStatus = (score >= 7) ? 'completed' : 'failed';
            }

            req.pool.query(
                `UPDATE GameSessions
                 SET status = ?, score = ?, time_used = ?
                 WHERE session_id = ?`,
                [finalStatus, score || 0, time_used || 0, session_id],
                (err) => {
                    if (err) {
                        console.error('Error updating session:', err);
                        return res.status(500).json({ error: 'Failed to update game session' });
                    }
const { player_id: playerId, level, category_id: categoryId } = results[0];

if (finalStatus === 'completed' && score >= 7) {
    if (categoryId !== 0) {
        const unlockQuery = `
            INSERT INTO UnlockedLevels (player_id, category_id, unlocked_level)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE unlocked_level = GREATEST(unlocked_level, VALUES(unlocked_level))`;

        req.pool.query(unlockQuery, [playerId, categoryId, level + 1], (err) => {
            if (err) console.error('Failed to unlock category level:', err);
        });
    } else {
        const unlockQuery = `
            INSERT INTO UnlockedLevels (player_id, category_id, unlocked_level)
            VALUES (?, 0, ?)
            ON DUPLICATE KEY UPDATE unlocked_level = GREATEST(unlocked_level, VALUES(unlocked_level))`;

        req.pool.query(unlockQuery, [playerId, level + 1], (err) => {
            if (err) {
                console.error('Failed to unlock random mode level:', err);
            }
        });
    }
}

          const sessionId = session_id;
          checkAchievements(req, playerId, sessionId)
            .then((unlockedNow) => {
              res.json({
                message: 'Game session updated',
                status: finalStatus,
                score: score || 0,
                time_used: time_used || 0,
                unlocked_achievements: unlockedNow
              });
            })
            .catch((err) => {
              console.error('Error checking achievements:', err);
              res.status(500).json({ error: 'Achievement check failed' });
            });
        }
      );
    }
  );
});

// Get game sessions for display
app.get('/api/game-sessions', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    req.pool.query(
        `SELECT
            gs.*,
            CASE
                WHEN gs.status = 'completed' THEN 'Passed'
                WHEN gs.status = 'failed' THEN 'Failed'
                ELSE 'In Progress'
            END as display_status,
            DATE_FORMAT(gs.timestamp, '%Y-%m-%d %H:%i') as formatted_time,
            CONCAT('Level ', gs.level) as level_display
         FROM GameSessions gs
         JOIN Players p ON gs.player_id = p.player_id
         WHERE p.user_id = ?
         ORDER BY gs.timestamp DESC
         LIMIT 10`,
        [req.session.user.user_id],
        (err, results) => {
            if (err) {
                console.error('Error fetching sessions:', err);
                return res.status(500).json({ error: 'Failed to fetch game sessions' });
            }
            res.json(results);
        }
    );
});

app.get('/api/unlocked-level', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  let { category_id } = req.query;

  const isRandom = category_id === 'random';

  req.pool.query(
    `SELECT player_id FROM Players WHERE user_id = ?`,
    [req.session.user.user_id],
    (err, results) => {
      if (err || !results.length) {
        return res.status(500).json({ error: 'Player not found' });
      }

      const playerId = results[0].player_id;

      const query = isRandom
        ? `SELECT unlocked_level FROM UnlockedLevels WHERE player_id = ? AND category_id IS NULL`
        : `SELECT unlocked_level FROM UnlockedLevels WHERE player_id = ? AND category_id = ?`;
      const params = isRandom ? [playerId] : [playerId, category_id];

      req.pool.query(query, params, (err, results) => {
        if (err) {
          console.error('Error fetching unlocked level:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        if (results.length > 0) {
          res.json({ unlocked_level: results[0].unlocked_level });
        } else {
          res.json({ unlocked_level: 1 });
        }
      });
    }
  );
});


app.post('/api/redeem-reward', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  req.pool.query(
    'SELECT player_id FROM Players WHERE user_id = ?',
    [req.session.user.user_id],
    (err, results) => {
      if (err || results.length === 0) {
        return res.status(500).json({ error: 'Player not found' });
      }

      const playerId = results[0].player_id;

      req.pool.query(
        'SELECT total_score FROM PlayerStats WHERE player_id = ?',
        [playerId],
        (err, results) => {
          if (err || results.length === 0) {
            return res.status(500).json({ error: 'Failed to get player score' });
          }

          const currentScore = results[0].total_score;
          const cost = 10;

          if (currentScore < cost) {
            return res.status(400).json({ error: 'Not enough points' });
          }

          req.pool.query(
            'UPDATE PlayerStats SET total_score = total_score - ? WHERE player_id = ?',
            [cost, playerId],
            (err) => {
              if (err) {
                return res.status(500).json({ error: 'Failed to deduct points' });
              }

              res.json({ message: 'Reward redeemed successfully', newScore: currentScore - cost });
            }
          );
        }
      );
    }
  );
});


app.use(logger('dev'));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

module.exports = app;
