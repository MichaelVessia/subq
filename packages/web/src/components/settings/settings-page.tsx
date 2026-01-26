import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { RevokeCliSessionRequest, type WeightUnit } from '@subq/shared'
import { useState } from 'react'
import { useUserSettings } from '../../hooks/use-user-settings.js'
import { ApiClient, CliSessionsAtom, ReactivityKeys } from '../../rpc.js'
import { Button } from '../ui/button.js'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js'
import { DatabaseError, UnauthorizedRedirect } from '../ui/error-states.js'
import { Label } from '../ui/label.js'
import { ListSkeleton } from '../ui/skeleton.js'
import { Switch } from '../ui/switch.js'
import { ChangePasswordForm } from './change-password-form.js'
import { CliDevices } from './cli-devices.js'
import { DataManagement } from './data-management.js'

export function SettingsPage() {
  const { weightUnit, setWeightUnit, remindersEnabled, setRemindersEnabled } = useUserSettings()
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false)
  const cliSessionsResult = useAtomValue(CliSessionsAtom)
  const revokeSession = useAtomSet(ApiClient.mutation('RevokeCliSession'), { mode: 'promise' })

  const handleUnitChange = (unit: WeightUnit) => {
    setWeightUnit(unit)
  }

  const handleRevokeSession = async (sessionId: string) => {
    await revokeSession({
      payload: new RevokeCliSessionRequest({ sessionId }),
      reactivityKeys: [ReactivityKeys.cliSessions],
    })
  }

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight mb-6">Settings</h2>

      <Card>
        <CardHeader>
          <CardTitle>Display Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label className="mb-3 block">Weight Unit</Label>
              <p className="text-sm text-muted-foreground mb-4">Choose how weights are displayed throughout the app.</p>
              <div className="flex gap-3">
                <Button variant={weightUnit === 'lbs' ? 'default' : 'outline'} onClick={() => handleUnitChange('lbs')}>
                  Pounds (lbs)
                </Button>
                <Button variant={weightUnit === 'kg' ? 'default' : 'outline'} onClick={() => handleUnitChange('kg')}>
                  Kilograms (kg)
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="block">Email Reminders</Label>
                <p className="text-sm text-muted-foreground">Receive an email reminder on shot days.</p>
              </div>
              <Switch checked={remindersEnabled} onCheckedChange={setRemindersEnabled} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          {passwordChangeSuccess && <p className="text-sm text-green-600 mb-4">Password changed successfully</p>}
          <ChangePasswordForm onSuccess={() => setPasswordChangeSuccess(true)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CLI Devices</CardTitle>
        </CardHeader>
        <CardContent>
          {Result.builder(cliSessionsResult)
            .onInitial(() => <ListSkeleton items={2} />)
            .onSuccess((data) => <CliDevices sessions={data.sessions} onRevoke={handleRevokeSession} />)
            .onErrorTag('Unauthorized', () => <UnauthorizedRedirect />)
            .onError(() => <DatabaseError />)
            .render()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
        </CardHeader>
        <CardContent>
          <DataManagement />
        </CardContent>
      </Card>
    </div>
  )
}
