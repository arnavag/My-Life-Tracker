# My Life Tracker - Complete Life Management App

A modern Flask-based life tracking application that helps you manage your habits, tasks, budget, weather, and notes all in one place with an attractive UI.

## Features

✨ **Dashboard** - Overview of all your important metrics with live clock
🔥 **Habit Tracker** - Build and track daily, weekly, or monthly habits
✓ **Task Manager** - Organize and complete your daily tasks  
💰 **Budget Tracker** - Monitor expenses and stay within budget
🌤️ **Weather Info** - Check weather for any city
📝 **Notes** - Keep your thoughts and ideas organized
📊 **Statistics** - Track progress with beautiful charts

## Installation

### Requirements
- Python 3.8+
- pip

### Setup

1. **Clone/Extract the project**
```bash
cd my_life_tracker
```

2. **Install dependencies**
```bash
pip install -r requirements.txt
```

3. **Run the application**
```bash
python app.py
```

4. **Open in browser**
```
http://localhost:5000
```

## Usage

### Dashboard
- View daily overview with task completion stats
- Live clock display
- Quick action buttons to add tasks, habits, expenses, or notes
- Weekly task completion chart

### Habits
- Create new habits with daily/weekly/monthly frequency
- Track completion streaks
- Mark habits as completed for the day
- Visual feedback on habit status

### Tasks
- Add tasks for today
- Check off completed tasks
- Delete tasks
- Real-time progress tracking

### Budget
- Set monthly budget limit
- Add expenses with categories
- Track spending by category with pie chart
- View transaction history

### Weather
- Search weather for any city
- View temperature, humidity, wind speed, pressure
- Real-time weather data

### Notes
- Create and save notes with title and content
- Delete notes
- Organized in a card grid layout

### Stats
- Weekly task completion chart
- Habit completion tracker
- Success rate metrics
- Overall statistics

## Data Storage

All data is stored locally in JSON files in the `data/` directory:
- `habits.json` - Habit tracking data
- `tasks.json` - Task data organized by date
- `budget.json` - Budget and transaction data
- `notes.json` - Notes data

## API Endpoints

### Habits
- `GET /api/habits` - Get all habits
- `POST /api/habits` - Create new habit
- `POST /api/habits/<id>/toggle` - Mark habit as complete/incomplete
- `DELETE /api/habits` - Delete habit

### Tasks
- `GET /api/tasks` - Get today's tasks
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/<id>/toggle` - Toggle task completion
- `DELETE /api/tasks/<id>` - Delete task

### Budget
- `GET /api/budget` - Get budget data
- `POST /api/budget` - Add transaction or set budget
- `DELETE /api/budget/<id>` - Delete transaction

### Notes
- `GET /api/notes` - Get all notes
- `POST /api/notes` - Create new note
- `DELETE /api/notes/<id>` - Delete note

## Technologies Used

- **Backend**: Flask (Python)
- **Frontend**: HTML5, CSS3, JavaScript
- **Charts**: Chart.js
- **Icons**: Font Awesome 6
- **Data Storage**: JSON files

## Customization

### Change Budget Currency
Edit `templates/budget.html` and replace `₹` with your preferred currency symbol.

### Modify Color Scheme
Edit `static/css/style.css` and change the CSS variables in `:root` section.

### Add Weather API
Get an API key from [OpenWeatherMap](https://openweathermap.org/api) and replace in `templates/weather.html`.

## Tips

- Your data syncs automatically and is saved locally
- Use the clock widget to keep track of time
- Weekly charts show your progress trends
- Budget transactions include timestamp for tracking

## Future Enhancements

- User authentication and multi-user support
- Cloud sync for data backup
- Mobile app version
- Goal setting and tracking
- Habit reminder notifications
- Export data to PDF/CSV

Enjoy tracking your life! 🚀
