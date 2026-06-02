import User from '../../models/User.js'
import { createPersonalWorkspace } from '../../utils/workspace.js'
import { signAccess } from '../../utils/jwt.js'

// Create a user + their personal workspace; return an access token + ids for integration tests.
export async function makeAuthedUser({ name = 'Test', email, role = 'user' } = {}) {
  const user = await User.create({
    name,
    email: email || `u${Math.random().toString(36).slice(2)}@x.com`,
    password: 'password123',
    role,
  })
  const workspace = await createPersonalWorkspace(user)
  const token = signAccess({ userId: user._id, email: user.email, role: user.role })
  return { user, workspace, token }
}
