// Local development entry point (Vercel uses api/index.js instead).
import app from './app.js';
import connectDB from './config/db.js';

const port = process.env.PORT || 5000;
await connectDB();
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
