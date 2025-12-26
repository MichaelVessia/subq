import type { WeightUnit } from '@subq/shared'
import { useUserSettings } from '../../hooks/use-user-settings.js'
import { Button } from '../ui/button.js'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js'
import { Label } from '../ui/label.js'
import { Switch } from '../ui/switch.js'
import { ChangePasswordForm } from './change-password-form.js'
import { DataManagement } from './data-management.js'

export function SettingsPage() {
  const { weightUnit, setWeightUnit, remindersEnabled, setRemindersEnabled } = useUserSettings()

  const handleUnitChange = (unit: WeightUnit) => {
    setWeightUnit(unit)
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
          <ChangePasswordForm />
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
