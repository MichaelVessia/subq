import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useForm } from 'react-hook-form'
import { changePassword } from '../../auth.js'
import { changePasswordFormStandardSchema, type ChangePasswordFormInput } from '../../lib/form-schemas.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { Label } from '../ui/label.js'

interface ChangePasswordFormProps {
  onSuccess: () => void
}

export function ChangePasswordForm({ onSuccess }: ChangePasswordFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormInput>({
    resolver: standardSchemaResolver(changePasswordFormStandardSchema),
    mode: 'onBlur',
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const onFormSubmit = async (data: ChangePasswordFormInput) => {
    try {
      const result = await changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        revokeOtherSessions: true,
      })
      if (result.error) {
        setError('root', { message: result.error.message ?? 'Failed to change password' })
      } else {
        reset()
        onSuccess()
      }
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : 'Failed to change password',
      })
    }
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="currentPassword" className="mb-2 block">
          Current Password
        </Label>
        <Input id="currentPassword" type="password" {...register('currentPassword')} error={!!errors.currentPassword} />
        {errors.currentPassword && (
          <span className="block text-xs text-destructive mt-1">{errors.currentPassword.message}</span>
        )}
      </div>
      <div>
        <Label htmlFor="newPassword" className="mb-2 block">
          New Password
        </Label>
        <Input id="newPassword" type="password" {...register('newPassword')} error={!!errors.newPassword} />
        {errors.newPassword && (
          <span className="block text-xs text-destructive mt-1">{errors.newPassword.message}</span>
        )}
      </div>
      <div>
        <Label htmlFor="confirmPassword" className="mb-2 block">
          Confirm New Password
        </Label>
        <Input id="confirmPassword" type="password" {...register('confirmPassword')} error={!!errors.confirmPassword} />
        {errors.confirmPassword && (
          <span className="block text-xs text-destructive mt-1">{errors.confirmPassword.message}</span>
        )}
      </div>
      {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Changing...' : 'Change Password'}
      </Button>
    </form>
  )
}
