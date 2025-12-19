import type { WeightUnit } from '@subq/shared'
import { useUserSettings } from '../../hooks/use-user-settings.js'
import { Button } from '../ui/button.js'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js'
import { Label } from '../ui/label.js'
import { ChangePasswordForm } from './change-password-form.js'

export function SettingsPage() {
  const { weightUnit, setWeightUnit } = useUserSettings()

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
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
