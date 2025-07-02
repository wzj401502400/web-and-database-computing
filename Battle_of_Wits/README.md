Battle of Wits is a full-stack trivia web game that challenges users to test their knowledge across various categories and difficulty levels. Users can play solo, earn achievements, track progress, redeem rewards, and interact in a global chatroom.

## Dev Container Quick Start
If you have Docker and VS Code with the Dev Containers extension installed:

Click the >< icon in the bottom-left corner of VS Code
Select Reopen in Container
The container will automatically install Node.js, MySQL client, and project dependencies (npm install)

## Project Description

Battle of Wits is a single-player trivia game built using Node.js (Express), MySQL, and HTML/CSS/JS. The game fetches trivia questions from the Open Trivia DB API and tracks user progress, achievements, and game sessions in a normalized relational database. The system includes a login/register flow, customizable quiz configuration, achievement and ranking systems, session tracking, reward redemption, and global chat.

## Setup Instructions
1. Install Required Software
- Node.js (v16+)
- MySQL Server 8+
- npm install

2. Clone the Repository
git clone https://github.com/UAdelaide/25S1_WDC_PG_Groups_12.git

3. Configure Environment Variables
- Create a .env file in the root directory if it doesn't exist:
DB_HOST=localhost
DB_USER=root
DB_PASS=your_mysql_password
DB_NAME=battle_of_wits
- If you've already created the .env file, you can skip this step.

4. Start MySQL Service and set up the database
- sudo service mysql start
- get into Mysql and CREATE DATABASE battle_of_wits;
- mysql -u root -p battle_of_wits < battle_of_wits.sql

5. Run the Application
- npm start


## Features & Functionality

1. Authentication
- User registration with hashed passwords (bcrypt)
- Secure login and persistent session management (express-session)
- Role-based route protection (RBAC – admin-only access)
- Session-based access control for protected resources
- SQL injection prevention using parameterized queries

2. Trivia Game
- Select mode: random or category challenge
- Select level: 1–10 with increasing difficulty
- Fetches questions from Open Trivia DB API
- Game timer and score tracking
- Saves session to GameSessions table

3. Player Progress
- Tracks total_score, game_time, total_games
- Displays statistics and session history
- Unlocks levels and stores in UnlockedLevels

4. Achievements System
- 10 achievements (e.g., First Game, Flawless Victory, Speed Demon)
- Some are hidden until unlocked
- Tracked via PlayerAchievements table
- Displayed with unlock date and status

5. Global Chat
- Chat with all logged-in users
- Messages stored in GlobalChatMessages
- Sending 10+ messages unlocks a chat-related achievement

6. Reward System
- Redeem reward using total score points (10 per reward)
- Deducts points and updates database

7. Profile Management
- Editable profile info: name, country, address, introduction
- Avatar auto-generated (Dicebear integration optional)

## Known Bugs or Limitations

- Session restore not implemented – If the browser is closed or refreshed mid-game, progress will be lost and not recoverable.
- Only single-player mode implemented – Multiplayer mode is planned but currently unavailable.
- Occasional API fetch issues – Trivia questions are fetched from the Open Trivia DB API, which can sometimes be unstable or return empty results. In such cases, the game may fail to start or display “No questions found.”