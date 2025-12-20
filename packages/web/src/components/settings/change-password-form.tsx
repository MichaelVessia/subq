import { useState } from 'react'
import { changePassword } from '../../auth.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { Label } from '../ui/label.js'

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const result = await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })
      if (result.error) {
        setError(result.error.message ?? 'Failed to change password')
      } else {
        setSuccess(true)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="currentPassword" className="mb-2 block">
          Current Password
        </Label>
        <Input
          id="currentPassword"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="newPassword" className="mb-2 block">
          New Password
        </Label>
        <Input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="confirmPassword" className="mb-2 block">
          Confirm New Password
        </Label>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">Password changed successfully</p>}
      <Button type="submit" disabled={loading}>
        {loading ? 'Changing...' : 'Change Password'}
      </Button>
    </form>
  )
}
