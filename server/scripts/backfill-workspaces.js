import { randomBytes } from 'crypto'
import mongoose from 'mongoose'
import { config } from '../config.js'
import User from '../models/User.js'
import Series from '../models/Series.js'
import Asset from '../models/Asset.js'
import Workspace from '../models/Workspace.js'
import { createPersonalWorkspace } from '../utils/workspace.js'

// Core migration logic — exported so it can be tested against an in-memory DB.
export async function runBackfill() {
  // 1. Convert any legacy Teams (collection may not exist post-removal; read raw).
  const teamWorkspaceMap = new Map() // teamId(str) -> workspaceId
  let legacyTeams = []
  try {
    legacyTeams = await mongoose.connection.collection('teams').find({}).toArray()
  } catch { legacyTeams = [] }

  for (const team of legacyTeams) {
    const existing = await Workspace.findOne({ migratedFromTeamId: team._id })
    if (existing) { teamWorkspaceMap.set(team._id.toString(), existing._id); continue }
    const members = (team.members || []).map(m => ({
      userId: m.userId,
      role: m.role === 'owner' ? 'owner' : m.role === 'admin' ? 'admin' : 'member',
    }))
    const ws = await Workspace.create({
      name: team.name || 'Workspace',
      type: 'organization',
      ownerId: team.ownerId,
      plan: ['pro', 'studio'].includes(team.plan) ? team.plan : 'free',
      members: members.length ? members : [{ userId: team.ownerId, role: 'owner' }],
      migratedFromTeamId: team._id,
    })
    teamWorkspaceMap.set(team._id.toString(), ws._id)
  }

  // 2. Ensure every user has a personal workspace + defaultWorkspaceId.
  const users = await User.find({})
  for (const user of users) {
    if (!user.defaultWorkspaceId) await createPersonalWorkspace(user)
  }

  // 3. Stamp legacy Series/Asset rows that lack workspaceId.
  //    Prefer the user's old teamId workspace if present, else their personal workspace.
  for (const Model of [Series, Asset]) {
    const rows = await Model.collection.find({ workspaceId: { $exists: false } }).toArray()
    for (const row of rows) {
      let wsId = row.teamId ? teamWorkspaceMap.get(row.teamId.toString()) : null
      if (!wsId) {
        const owner = await User.findById(row.userId)
        wsId = owner?.defaultWorkspaceId
      }
      if (wsId) {
        await Model.collection.updateOne({ _id: row._id }, { $set: { workspaceId: wsId }, $unset: { teamId: '' } })
      }
    }
  }

  // 4. Clean up legacy explicit-null shareTokens. A sparse unique index skips ABSENT fields,
  //    not explicit nulls, so old rows with shareToken:null collide. Replace each with a
  //    unique token so countDocuments({ shareToken: null }) returns 0 after the migration.
  const nullTokenDocs = await Series.collection.find({ shareToken: { $type: 10 } }).toArray()
  for (const doc of nullTokenDocs) {
    await Series.collection.updateOne(
      { _id: doc._id },
      { $set: { shareToken: randomBytes(8).toString('hex') } }
    )
  }

  return { teams: teamWorkspaceMap.size, users: users.length }
}

// CLI entrypoint — only runs when invoked directly (not when imported by tests).
const isDirectRun = process.argv[1] && process.argv[1].endsWith('backfill-workspaces.js')
if (isDirectRun) {
  mongoose.connect(config.mongoUri).then(async () => {
    const result = await runBackfill()
    console.log('✓ Backfill complete:', result)
    await mongoose.disconnect()
    process.exit(0)
  }).catch(err => { console.error('✗ Backfill failed:', err); process.exit(1) })
}
