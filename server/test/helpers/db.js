import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

let mongod = null

export async function startTestDB() {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}

export async function stopTestDB() {
  await mongoose.disconnect()
  if (mongod) await mongod.stop()
}

export async function clearTestDB() {
  const { collections } = mongoose.connection
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({})
  }
}
