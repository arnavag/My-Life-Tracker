from flask import Flask, render_template, request, jsonify
from datetime import datetime, timedelta
from pathlib import Path
import json, logging, os, uuid

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False
logging.getLogger('werkzeug').setLevel(logging.CRITICAL)
logging.getLogger('flask').setLevel(logging.CRITICAL)

DATA_DIR = Path('data')
DATA_DIR.mkdir(exist_ok=True)
HABITS_FILE = DATA_DIR / 'habits.json'
TASKS_FILE = DATA_DIR / 'tasks.json'
BUDGET_FILE = DATA_DIR / 'budget.json'
NOTES_FILE = DATA_DIR / 'notes.json'

def get_backup(path):
    bak = Path(str(path) + '.backup')
    return json.load(open(bak)) if bak.exists() else {}

def load_json(file_path):
    try:
        if file_path.exists():
            content = file_path.read_text()
            return json.loads(content) if content.strip() else get_backup(file_path)
    except:
        return get_backup(file_path)
    return {}

def save_json(file_path, data):
    bak = Path(str(file_path) + '.backup')
    file_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        if file_path.exists():
            bak.write_text(file_path.read_text())
    except:
        pass
    tmp = Path(str(file_path) + '.tmp')
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(file_path)

def parse_budget(val):
    try:
        x = float(val) if val not in (None, '') else 0
        return int(x) if x.is_integer() else x
    except:
        return 0

def month_spent(txns, now):
    total = 0
    for t in txns:
        try:
            td = datetime.fromisoformat(t.get('date'))
            if td.year == now.year and td.month == now.month:
                total += t.get('amount', 0)
        except:
            pass
    return total

@app.route('/')
def index():
    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')
    tasks = load_json(TASKS_FILE)
    today_tasks = [t for t in tasks.get(today_str, []) if not t.get('completed')]
    completed_tasks = [t for t in tasks.get(today_str, []) if t.get('completed')]
    habits = load_json(HABITS_FILE)
    completed_habits = sum(1 for h in habits.values() if today_str in h.get('completed_dates', []))
    budget_data = load_json(BUDGET_FILE)
    monthly_spent = month_spent(budget_data.get('transactions', []), now)
    budget_limit = parse_budget(budget_data.get('limit', 0))
    notes_data = load_json(NOTES_FILE)
    notes_count = len(notes_data.get('notes', [])) if isinstance(notes_data, dict) else 0
    
    return render_template('index.html', 
        today=now.strftime('%A, %B %d, %Y'),
        pending_tasks=len(today_tasks),
        completed_tasks=len(completed_tasks),
        total_tasks=len(today_tasks) + len(completed_tasks),
        monthly_spent=monthly_spent,
        budget_limit=budget_limit,
        total_habits=len(habits),
        completed_habits_today=completed_habits,
        notes_count=notes_count)

@app.route('/habits')
def habits_page():
    return render_template('habits.html', habits=load_json(HABITS_FILE))

@app.route('/api/habits', methods=['GET', 'POST', 'DELETE'])
def api_habits():
    habits = load_json(HABITS_FILE)
    if request.method == 'GET':
        for h in habits.values():
            unique = list(dict.fromkeys(h.get('completed_dates', [])))
            h['completed_dates'] = unique
            h['days_completed'] = len(unique)
        save_json(HABITS_FILE, habits)
        return jsonify(habits)
    elif request.method == 'POST':
        data = request.json
        if not data or not data.get('name'):
            return {'error': 'Name required'}, 400
        habit = {
            'id': str(uuid.uuid4()),
            'name': data.get('name'),
            'frequency': data.get('frequency', 'daily'),
            'completed_dates': [],
            'days_completed': 0,
            'created_at': datetime.now().isoformat()
        }
        habits[habit['id']] = habit
        save_json(HABITS_FILE, habits)
        return jsonify(habit), 201
    else:
        hid = request.json.get('id')
        if hid in habits:
            del habits[hid]
            save_json(HABITS_FILE, habits)
            return {'status': 'deleted'}
        return {'error': 'Not found'}, 404

@app.route('/api/habits/<hid>/toggle', methods=['POST'])
def toggle_habit(hid):
    habits = load_json(HABITS_FILE)
    if hid not in habits:
        return {'error': 'Not found'}, 404
    today = datetime.now().strftime('%Y-%m-%d')
    dates = list(dict.fromkeys(habits[hid].get('completed_dates', [])))
    dates.remove(today) if today in dates else dates.append(today)
    habits[hid]['completed_dates'] = dates
    habits[hid]['days_completed'] = len(dates)
    save_json(HABITS_FILE, habits)
    return jsonify(habits[hid])

@app.route('/tasks')
def tasks_page():
    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')
    return render_template('tasks.html', 
        tasks=load_json(TASKS_FILE).get(today_str, []),
        date=now.strftime('%d/%m/%y'))

@app.route('/api/tasks', methods=['GET', 'POST'])
def api_tasks():
    today = datetime.now().strftime('%Y-%m-%d')
    tasks = load_json(TASKS_FILE)
    if request.method == 'GET':
        return jsonify(tasks.get(today, []))
    data = request.json
    if not data or not data.get('title'):
        return {'error': 'Title required'}, 400
    if today not in tasks:
        tasks[today] = []
    task = {
        'id': str(uuid.uuid4()),
        'title': data.get('title'),
        'completed': False,
        'created_at': datetime.now().isoformat()
    }
    tasks[today].append(task)
    save_json(TASKS_FILE, tasks)
    return jsonify(task), 201

@app.route('/api/tasks/<tid>/toggle', methods=['PUT'])
def toggle_task(tid):
    today = datetime.now().strftime('%Y-%m-%d')
    tasks = load_json(TASKS_FILE)
    if today in tasks:
        for task in tasks[today]:
            if task['id'] == tid:
                task['completed'] = not task['completed']
                save_json(TASKS_FILE, tasks)
                return jsonify(task)
    return {'error': 'Not found'}, 404

@app.route('/api/tasks/<tid>', methods=['DELETE'])
def delete_task(tid):
    today = datetime.now().strftime('%Y-%m-%d')
    tasks = load_json(TASKS_FILE)
    if today in tasks:
        tasks[today] = [t for t in tasks[today] if t['id'] != tid]
        save_json(TASKS_FILE, tasks)
        return {'status': 'deleted'}
    return {'error': 'Not found'}, 404

@app.route('/weather')
def weather():
    return render_template('weather.html')

@app.route('/budget')
def budget():
    budget_data = load_json(BUDGET_FILE)
    txns = budget_data.get('transactions', [])
    now = datetime.now()
    spent = month_spent(txns, now)
    limit = parse_budget(budget_data.get('limit', 0))
    return render_template('budget.html',
        transactions=txns,
        budget_limit=limit,
        monthly_spent=spent,
        remaining=limit - spent if limit else '',
        budget_limit_set='limit' in budget_data)

@app.route('/api/budget', methods=['GET', 'POST'])
def api_budget():
    budget_data = load_json(BUDGET_FILE)
    if request.method == 'GET':
        budget_data['limit'] = parse_budget(budget_data.get('limit', 0))
        return jsonify(budget_data)
    data = request.json
    if not data:
        return {'error': 'Invalid'}, 400
    if 'transactions' not in budget_data:
        budget_data['transactions'] = []
    if 'limit' in data:
        budget_data['limit'] = parse_budget(data['limit'])
    else:
        if not data.get('amount'):
            return {'error': 'Amount required'}, 400
        budget_data['transactions'].append({
            'id': str(uuid.uuid4()),
            'category': data.get('category', 'Uncategorized'),
            'amount': data.get('amount'),
            'description': data.get('description', ''),
            'date': datetime.now().isoformat()
        })
    save_json(BUDGET_FILE, budget_data)
    return jsonify(budget_data), 201

@app.route('/api/budget/<txn_id>', methods=['DELETE'])
def delete_transaction(txn_id):
    budget_data = load_json(BUDGET_FILE)
    original = len(budget_data.get('transactions', []))
    budget_data['transactions'] = [t for t in budget_data.get('transactions', []) if t['id'] != txn_id]
    if len(budget_data['transactions']) < original:
        save_json(BUDGET_FILE, budget_data)
        return {'status': 'deleted'}
    return {'error': 'Not found'}, 404

@app.route('/notes')
def notes_page():
    notes_data = load_json(NOTES_FILE)
    return render_template('notes.html', notes=notes_data.get('notes', []))

@app.route('/api/notes', methods=['GET', 'POST'])
def api_notes():
    notes_data = load_json(NOTES_FILE)
    if not isinstance(notes_data, dict):
        notes_data = {}
    if request.method == 'GET':
        return jsonify(notes_data)
    data = request.json
    if not data or not data.get('title'):
        return {'error': 'Title required'}, 400
    if 'notes' not in notes_data:
        notes_data['notes'] = []
    note = {
        'id': str(uuid.uuid4()),
        'title': data.get('title'),
        'content': data.get('content', ''),
        'created_at': datetime.now().isoformat()
    }
    notes_data['notes'].append(note)
    save_json(NOTES_FILE, notes_data)
    return jsonify(note), 201

@app.route('/api/notes/<nid>', methods=['DELETE'])
def delete_note(nid):
    notes_data = load_json(NOTES_FILE)
    original = len(notes_data.get('notes', []))
    notes_data['notes'] = [n for n in notes_data.get('notes', []) if n['id'] != nid]
    if len(notes_data['notes']) < original:
        save_json(NOTES_FILE, notes_data)
        return {'status': 'deleted'}
    return {'error': 'Not found'}, 404

@app.route('/stats')
def stats():
    habits_data = load_json(HABITS_FILE)
    stats_dict = {}
    for i in range(7):
        date = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
        tasks = load_json(TASKS_FILE).get(date, [])
        stats_dict[date] = len([t for t in tasks if t.get('completed')])
    return render_template('stats.html', habits=habits_data, weekly_stats=stats_dict)

@app.route('/api/stats')
def api_stats():
    period = request.args.get('period', 'month')
    stats_list = []
    now = datetime.now()
    if period == 'week':
        for i in range(6, -1, -1):
            date = (now - timedelta(days=i)).strftime('%Y-%m-%d')
            tasks = load_json(TASKS_FILE).get(date, [])
            completed = len([t for t in tasks if t.get('completed')])
            stats_list.append({'date': date, 'completed': completed, 'total': len(tasks)})
    else:
        cur = now.replace(day=1)
        while cur.date() <= now.date():
            date_str = cur.strftime('%Y-%m-%d')
            tasks = load_json(TASKS_FILE).get(date_str, [])
            completed = len([t for t in tasks if t.get('completed')])
            stats_list.append({'date': date_str, 'completed': completed, 'total': len(tasks)})
            cur += timedelta(days=1)
    return jsonify(stats_list)

if __name__ == '__main__':
    PORT = int(os.environ.get('PORT') or os.environ.get('FLASK_RUN_PORT') or 5007)
    print(f"\n{'='*60}\n>>> Life Tracker is running!\n{'='*60}")
    print(f"[+] Local:   http://localhost:{PORT}\n[+] Network: http://127.0.0.1:{PORT}\n{'='*60}\n")
    app.run(debug=False, host='127.0.0.1', port=PORT, use_reloader=False)