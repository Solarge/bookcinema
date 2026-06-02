import mongoose from 'mongoose'
import { config } from './config.js'

export async function connectDB() {
  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      // Atlas-recommended settings
      maxPoolSize: 10,
      retryWrites: true,
    })
    console.log('✓ MongoDB Atlas connected')
  } catch (err) {
    console.error('✗ MongoDB connection failed:', err.message)
    process.exit(1)
  }
}

mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected — retrying...'))
mongoose.connection.on('error', err => console.error('MongoDB error:', err.message))
