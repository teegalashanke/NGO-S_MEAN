const express = require('express');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/database');

// --- Use the existing import name: './routes/tasks' ---
const volunteerRoutes = require('./routes/volunteers');
const taskRoutes = require('./routes/tasks'); 
const projectRoutes = require('./routes/projects');

// Add Volunteer and Task models at the top
const Volunteer = require('./models/volunteer');
const Task = require('./models/task');
const Project = require('./models/project');
const cron = require('node-cron');

const app = express();

// Connect to MongoDB with event handling
connectDB().then(conn => {
    conn.connection.on('error', err => {
        console.error('MongoDB connection error:', err);
    });

    conn.connection.on('disconnected', () => {
        console.log('MongoDB disconnected');
    });
}).catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
});

// view engine setup
app.set('views', path.join(__dirname,'app_server','views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json()); // Essential for handling JSON API requests (POST/PUT)

// --- REDUNDANCY REMOVED: This covers all URL-encoded forms ---
app.use(express.urlencoded({ extended: true })); // Set to true for modern parsing

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Add this after your static middleware
app.use((req, res, next) => {
    res.locals.title = 'NGO Volunteer Management';
    next();
});

// --- View Routes ---
app.get('/', (req, res) => {
    res.render('index', { 
        title: 'Home', 
        message: 'Welcome to Volunteer Engagement App!' 
    });
});

app.get('/about', (req, res) => {
    res.render('about', { 
        title: 'About Us',
        message: 'Learn about our volunteer management platform'
    });
});

// --- IMPACT REPORT VIEW ROUTE (Logic check remains sound) ---
app.get('/impact', async (req, res, next) => {
    try {
        const [volunteersCount, tasks, projects] = await Promise.all([
            Volunteer.countDocuments(),
            Task.find({ status: 'Completed' }).populate('assignedTo'),
            Project.find({ status: { $in: ['planning', 'active', 'completed'] } })
        ]);

        // Prefer project-level rollups
        const totalPeopleHelped = projects.reduce((sum, p) => sum + (p.peopleHelped || 0), 0);
        const totalHours = projects.reduce((sum, p) => sum + (p.hoursWorked || 0), 0);

        res.render('impact', {
            title: 'Impact Reports',
            volunteersCount,
            totalPeopleHelped,
            totalHours,
            tasks
        });
    } catch (err) {
        next(err);
    }
});

// --- Route Middleware (All /volunteers and /tasks paths) ---
app.use('/volunteers', volunteerRoutes);
app.use('/tasks', taskRoutes);
app.use('/projects', projectRoutes);

// --- 404 CATCHER: Add this before the error handler ---
// This middleware catches requests that fell through all other routes
app.use((req, res, next) => {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
});


// Error handler should be last
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500);
    res.render('error', {
        title: 'Error',
        message: err.message,
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

module.exports = app;

// Schedule daily metrics update at 00:00 server time
// Increments hoursWorked by 6 and peopleHelped by 10 for active projects
cron.schedule('0 0 * * *', async () => {
    try {
        await Project.updateMany(
            { status: 'active' },
            { $inc: { hoursWorked: 6, peopleHelped: 10 } }
        );
        console.log('Daily project metrics updated (+6 hours, +10 people)');
    } catch (err) {
        console.error('Cron update failed:', err.message);
    }
});