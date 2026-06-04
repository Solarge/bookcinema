import User from '../../models/User.js'
import { createPersonalWorkspace } from '../../utils/workspace.js'
import { signAccess } from '../../utils/jwt.js'

// Create a user + their personal workspace; return an access token + ids for integration tests.
// emailVerifiedAt is set to now by default so existing managed-generation tests keep passing
// (unverified users are blocked from managed generation after the hardening T1 changes).
export async function makeAuthedUser({ name = 'Test', email, role = 'user', emailVerifiedAt = new Date() } = {}) {
  const user = await User.create({
    name,
    email: email || `u${Math.random().toString(36).slice(2)}@x.com`,
    password: 'password1234',
    role,
    emailVerifiedAt,
  })
  const workspace = await createPersonalWorkspace(user)
  const token = signAccess({ userId: user._id, email: user.email, role: user.role })
  return { user, workspace, token }
}
