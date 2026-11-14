import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export const connectDB = async () => {
  const primaryUri = process.env.MONGODB_URI;
  const fallbackUri = 'mongodb://127.0.0.1:27017/local_stream';

  try {
    const conn = await mongoose.connect(primaryUri, { serverSelectionTimeoutMS: 6000 });
    console.log(`[MongoDB Atlas] Connected: ${conn.connection.host}`);
  } catch (error) {
    console.warn(`\n⚠️  [MongoDB Atlas Warning]: Could not connect to Atlas (${error.message.split('.')[0]}).`);
    console.warn(`👉 To use Atlas, enable '0.0.0.0/0' (Allow access from anywhere) in MongoDB Atlas Network Access.`);
    console.log(`🔄 [MongoDB Fallback] Connecting to local MongoDB container (127.0.0.1:27017)...`);
    try {
      const localConn = await mongoose.connect(fallbackUri);
      console.log(`✅ [MongoDB Local] Connected successfully: ${localConn.connection.host}\n`);
    } catch (localErr) {
      console.error(`❌ [MongoDB Error]: Neither Atlas nor local MongoDB could connect.`, localErr.message);
      process.exit(1);
    }
  }
};
