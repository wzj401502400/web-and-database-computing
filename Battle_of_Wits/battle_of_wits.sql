DROP TABLE IF EXISTS SessionQuestions;
DROP TABLE IF EXISTS GameSessions;
DROP TABLE IF EXISTS GlobalChatMessages;
DROP TABLE IF EXISTS PlayerAchievements;
DROP TABLE IF EXISTS PlayerStats;
DROP TABLE IF EXISTS UnlockedLevels;
DROP TABLE IF EXISTS Questions;
DROP TABLE IF EXISTS Achievements;
DROP TABLE IF EXISTS Players;
DROP TABLE IF EXISTS Users;

CREATE TABLE Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(10) DEFAULT 'user'
);

CREATE TABLE Players (
    player_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT UNIQUE,
    given_name VARCHAR(100),
    family_name VARCHAR(100),
    email VARCHAR(100) UNIQUE NOT NULL,
    current_level INT,
    country VARCHAR(100),
    address VARCHAR(255),
    reward_points INT DEFAULT 0,
    introduction TEXT,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE GlobalChatMessages (
  message_id INT AUTO_INCREMENT PRIMARY KEY,
  player_id INT,
  content TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES Players(player_id) ON DELETE CASCADE
);

CREATE TABLE GameSessions (
    session_id INT PRIMARY KEY AUTO_INCREMENT,
    player_id INT NOT NULL,
    category_id INT NOT NULL DEFAULT 0,
    game_mode VARCHAR(50) DEFAULT 'single',
    level INT DEFAULT 1,
    score INT DEFAULT 0,
    time_used INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'completed',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES Players(player_id)
);

CREATE TABLE Questions (
    question_id INT AUTO_INCREMENT PRIMARY KEY,
    question_text TEXT,
    correct_answer TEXT,
    incorrect_answers JSON,
    category VARCHAR(100),
    difficulty VARCHAR(50),
    question_type VARCHAR(50)
);

CREATE TABLE SessionQuestions (
    session_id INT,
    question_id INT,
    player_answer TEXT,
    PRIMARY KEY (session_id, question_id),
    FOREIGN KEY (session_id) REFERENCES GameSessions(session_id),
    FOREIGN KEY (question_id) REFERENCES Questions(question_id)
);

CREATE TABLE Achievements (
    achievement_id INT PRIMARY KEY,
    title VARCHAR(100),
    requirement TEXT,
    is_hidden BOOLEAN DEFAULT FALSE
);

CREATE TABLE PlayerAchievements (
    achievement_id INT,
    player_id INT,
    unlock_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (achievement_id, player_id),
    FOREIGN KEY (achievement_id) REFERENCES Achievements(achievement_id),
    FOREIGN KEY (player_id) REFERENCES Players(player_id)
);

INSERT INTO Achievements (achievement_id, title, requirement, is_hidden) VALUES
(1, 'First Game', 'Finish your first game', false),
(2, 'Category Explorer', 'Play at least one game in 5 different categories', false),
(3, 'Talkative Soul', 'Send 10 messages in the global chat', false),
(4, 'True Challenger', 'Reach Level 5 in any one category', false),
(5, 'Multi-Path Seeker', 'Reach Level 3 in 3 different categories', false),
(6, 'Collector Spirit', 'Unlock 5 different achievements', false),
(7, 'Session Grinder', 'Complete 30 total game sessions', false),
(8, 'Elite Challenger', 'Reach Level 10 in any one category', false),
(9, 'Speed Demon', 'Finish any game in under 20 seconds', true),
(10, 'Flawless Victory', 'Achieve a perfect game by answering all 10 questions correctly', true);

CREATE TABLE PlayerStats (
    player_id INT PRIMARY KEY,
    total_score INT DEFAULT 0,
    player_rank VARCHAR(50) DEFAULT 'Beginner',
    game_time INT DEFAULT 0,
    total_games INT DEFAULT 0,
    FOREIGN KEY (player_id) REFERENCES Players(player_id)
);

CREATE TABLE UnlockedLevels (
    player_id INT NOT NULL,
    category_id INT NOT NULL DEFAULT 0,
    unlocked_level INT NOT NULL DEFAULT 1,
    PRIMARY KEY (player_id, category_id),
    FOREIGN KEY (player_id) REFERENCES Players(player_id),
    CHECK (unlocked_level BETWEEN 1 AND 10)
);

-- Index to speed up queries that retrieve all game sessions for a specific player
CREATE INDEX idx_game_player ON GameSessions(player_id);

-- Composite index to optimize chat history queries by player and timestamp
CREATE INDEX idx_chat_player_time ON GlobalChatMessages(player_id, timestamp);

-- Index to improve performance of ranking queries based on total score
CREATE INDEX idx_stats_score ON PlayerStats(total_score);