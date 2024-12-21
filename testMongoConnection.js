const { MongoClient } = require('mongodb');
require('dotenv').config();

(async () => {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB;

    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        console.log(`Successfully connected to MongoDB database: ${dbName}`);
        const db = client.db(dbName);
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err.message);
    } finally {
        await client.close();
    }
})();
