import { DrugName, DrugSource, InventoryCreate, type InventoryId, InventoryUpdate, TotalAmount } from '@subq/shared'
import { Option } from 'effect'
import { useState } from 'react'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { Label } from '../ui/label.js'
import { Select } from '../ui/select.js'

// Drugs organized by form type
const VIAL_DRUGS = ['Semaglutide (Compounded)', 'Tirzepatide (Compounded)', 'Retatrutide (Compounded)']

const PEN_DRUGS = [
  'Semaglutide (Ozempic)',
  'Semaglutide (Wegovy)',
  'Tirzepatide (Mounjaro)',
  'Tirzepatide (Zepbound)',
  'Liraglutide (Saxenda)',
  'Dulaglutide (Trulicity)',
]

interface InventoryFormProps {
  onSubmit: (data: InventoryCreate, quantity: number) => Promise<void>
  onUpdate?: (data: InventoryUpdate) => Promise<void>
  onCancel: () => void
  initialData?: {
    id?: InventoryId
    drug?: string
    source?: string
    form?: 'vial' | 'pen'
    totalAmount?: string
    status?: 'new' | 'opened' | 'finished'
    beyondUseDate?: Date | null
  }
}

interface FormErrors {
  drug?: string
  source?: string
  totalAmount?: string
}

export function InventoryForm({ onSubmit, onUpdate, onCancel, initialData }: InventoryFormProps) {
  const isEditing = !!initialData?.id
  const [form, setForm] = useState<'vial' | 'pen'>(initialData?.form ?? 'vial')
  const [drug, setDrug] = useState(initialData?.drug ?? '')
  const [source, setSource] = useState(initialData?.source ?? '')
  const [totalAmount, setTotalAmount] = useState(initialData?.totalAmount ?? '')

  // Get drugs filtered by form type
  const availableDrugs = form === 'vial' ? VIAL_DRUGS : PEN_DRUGS

  // Clear drug selection when form changes and drug isn't valid for new form
  const handleFormChange = (newForm: 'vial' | 'pen') => {
    setForm(newForm)
    const drugsForForm = newForm === 'vial' ? VIAL_DRUGS : PEN_DRUGS
    if (drug && !drugsForForm.includes(drug)) {
      setDrug('')
    }
  }
  const [status, setStatus] = useState<'new' | 'opened' | 'finished'>(initialData?.status ?? 'new')
  const [beyondUseDate, setBeyondUseDate] = useState(() => {
    if (!initialData?.beyondUseDate) return ''
    const d = initialData.beyondUseDate
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [quantity, setQuantity] = useState('1')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}
    if (!drug.trim()) newErrors.drug = 'Drug is required'
    if (!source.trim()) newErrors.source = 'Pharmacy source is required'
    if (!totalAmount.trim()) newErrors.totalAmount = 'Total amount is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ drug: true, source: true, totalAmount: true })

    if (!validateForm()) return

    setLoading(true)
    try {
      if (isEditing && onUpdate && initialData?.id) {
        await onUpdate(
          new InventoryUpdate({
            id: initialData.id,
            drug: DrugName.make(drug),
            source: DrugSource.make(source),
            form,
            totalAmount: TotalAmount.make(totalAmount),
            status,
            beyondUseDate: beyondUseDate ? Option.some(new Date(beyondUseDate)) : Option.some(null),
          }),
        )
      } else {
        await onSubmit(
          new InventoryCreate({
            drug: DrugName.make(drug),
            source: DrugSource.make(source),
            form,
            totalAmount: TotalAmount.make(totalAmount),
            status,
            beyondUseDate: beyondUseDate ? Option.some(new Date(beyondUseDate)) : Option.none(),
          }),
          Math.max(1, Math.min(10, Number.parseInt(quantity, 10) || 1)),
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const isValid = drug !== '' && source !== '' && totalAmount !== ''

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Form type first - affects available medications */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <Label htmlFor="form" className="mb-2 block">
            Form <span className="text-destructive">*</span>
          </Label>
          <Select id="form" value={form} onChange={(e) => handleFormChange(e.target.value as 'vial' | 'pen')}>
            <option value="vial">Vial (Compounded)</option>
            <option value="pen">Pen (Branded)</option>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {form === 'vial' ? 'Multi-dose vials from compounding pharmacies' : 'Pre-filled pens from manufacturers'}
          </p>
        </div>

        <div>
          <Label htmlFor="drug" className="mb-2 block">
            Medication <span className="text-destructive">*</span>
          </Label>
          <Select
            id="drug"
            value={drug}
            onChange={(e) => setDrug(e.target.value)}
            onBlur={() => handleBlur('drug')}
            error={touched.drug && !!errors.drug}
          >
            <option value="">Select medication</option>
            {availableDrugs.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          {touched.drug && errors.drug && <span className="block text-xs text-destructive mt-1">{errors.drug}</span>}
        </div>
      </div>

      <div className={`grid gap-4 mb-4 ${isEditing ? 'grid-cols-3' : 'grid-cols-4'}`}>
        <div>
          <Label htmlFor="source" className="mb-2 block">
            Pharmacy <span className="text-destructive">*</span>
          </Label>
          <Input
            type="text"
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onBlur={() => handleBlur('source')}
            placeholder={form === 'vial' ? 'e.g., Empower Pharmacy' : 'e.g., CVS, Walgreens'}
            error={touched.source && !!errors.source}
          />
          {touched.source && errors.source && (
            <span className="block text-xs text-destructive mt-1">{errors.source}</span>
          )}
        </div>

        <div>
          <Label htmlFor="totalAmount" className="mb-2 block">
            Total Amount <span className="text-destructive">*</span>
          </Label>
          <Input
            type="text"
            id="totalAmount"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            onBlur={() => handleBlur('totalAmount')}
            placeholder={form === 'vial' ? 'e.g., 10mg, 20mg' : 'e.g., 2.5mg, 5mg'}
            error={touched.totalAmount && !!errors.totalAmount}
          />
          {touched.totalAmount && errors.totalAmount && (
            <span className="block text-xs text-destructive mt-1">{errors.totalAmount}</span>
          )}
        </div>

        <div>
          <Label htmlFor="status" className="mb-2 block">
            Status
          </Label>
          <Select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'new' | 'opened' | 'finished')}
          >
            <option value="new">New</option>
            <option value="opened">Opened</option>
            <option value="finished">Finished</option>
          </Select>
        </div>

        {!isEditing && (
          <div>
            <Label htmlFor="quantity" className="mb-2 block">
              Quantity
            </Label>
            <Input
              type="number"
              id="quantity"
              min={1}
              max={10}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onBlur={(e) => {
                const val = Math.max(1, Math.min(10, Number.parseInt(e.target.value, 10) || 1))
                setQuantity(String(val))
              }}
            />
            <p className="text-xs text-muted-foreground mt-1">Create multiple identical items</p>
          </div>
        )}
      </div>

      {form === 'vial' && (
        <div className="mb-4">
          <Label htmlFor="beyondUseDate" className="mb-2 block">
            Beyond Use Date (BUD)
          </Label>
          <Input
            type="date"
            id="beyondUseDate"
            value={beyondUseDate}
            onChange={(e) => setBeyondUseDate(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Compounded vials typically have a 28-day BUD once opened. Check your pharmacy label.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading || !isValid}>
          {loading ? 'Saving...' : isEditing ? 'Update' : 'Add'}
        </Button>
      </div>
    </form>
  )
}
