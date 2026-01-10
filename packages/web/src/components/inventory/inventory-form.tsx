import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { DrugName, DrugSource, InventoryCreate, type InventoryId, InventoryUpdate, TotalAmount } from '@subq/shared'
import { DateTime, Option } from 'effect'
import { useForm } from 'react-hook-form'
import { type InventoryFormInput, inventoryFormStandardSchema } from '../../lib/form-schemas.js'
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

export function InventoryForm({ onSubmit, onUpdate, onCancel, initialData }: InventoryFormProps) {
  const isEditing = !!initialData?.id

  const formatBeyondUseDate = (date: Date | null | undefined): string => {
    if (!date) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InventoryFormInput>({
    resolver: standardSchemaResolver(inventoryFormStandardSchema),
    mode: 'onBlur',
    defaultValues: {
      form: initialData?.form ?? 'vial',
      drug: initialData?.drug ?? '',
      source: initialData?.source ?? '',
      totalAmount: initialData?.totalAmount ?? '',
      status: initialData?.status ?? 'new',
      beyondUseDate: formatBeyondUseDate(initialData?.beyondUseDate),
      quantity: '1',
    },
  })

  const formType = watch('form')
  const drug = watch('drug')
  const source = watch('source')
  const totalAmount = watch('totalAmount')

  // Get drugs filtered by form type
  const availableDrugs = formType === 'vial' ? VIAL_DRUGS : PEN_DRUGS

  // Simple validity check for button enable state (matches original behavior)
  const hasRequiredFields = drug !== '' && source !== '' && totalAmount !== ''

  const onFormSubmit = async (data: InventoryFormInput) => {
    if (isEditing && onUpdate && initialData?.id) {
      await onUpdate(
        new InventoryUpdate({
          id: initialData.id,
          drug: DrugName.make(data.drug),
          source: DrugSource.make(data.source),
          form: data.form,
          totalAmount: TotalAmount.make(data.totalAmount),
          status: data.status,
          beyondUseDate: data.beyondUseDate
            ? Option.some(DateTime.unsafeMake(new Date(data.beyondUseDate)))
            : Option.some(null),
        }),
      )
    } else {
      const quantity = Math.max(1, Math.min(10, Number.parseInt(data.quantity, 10) || 1))
      await onSubmit(
        new InventoryCreate({
          drug: DrugName.make(data.drug),
          source: DrugSource.make(data.source),
          form: data.form,
          totalAmount: TotalAmount.make(data.totalAmount),
          status: data.status,
          beyondUseDate: data.beyondUseDate
            ? Option.some(DateTime.unsafeMake(new Date(data.beyondUseDate)))
            : Option.none(),
        }),
        quantity,
      )
    }
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
      {/* Form type first - affects available medications */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <Label htmlFor="form" className="mb-2 block">
            Form <span className="text-destructive">*</span>
          </Label>
          <Select
            id="form"
            {...register('form')}
            onChange={(e) => {
              register('form').onChange(e)
              // Clear drug if not valid for new form type
              const newFormType = e.target.value as 'vial' | 'pen'
              const newAvailableDrugs = newFormType === 'vial' ? VIAL_DRUGS : PEN_DRUGS
              if (drug && !newAvailableDrugs.includes(drug)) {
                setValue('drug', '')
              }
            }}
          >
            <option value="vial">Vial (Compounded)</option>
            <option value="pen">Pen (Branded)</option>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {formType === 'vial'
              ? 'Multi-dose vials from compounding pharmacies'
              : 'Pre-filled pens from manufacturers'}
          </p>
        </div>

        <div>
          <Label htmlFor="drug" className="mb-2 block">
            Medication <span className="text-destructive">*</span>
          </Label>
          <Select id="drug" {...register('drug')} error={!!errors.drug}>
            <option value="">Select medication</option>
            {availableDrugs.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          {errors.drug && <span className="block text-xs text-destructive mt-1">{errors.drug.message}</span>}
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
            {...register('source')}
            placeholder={formType === 'vial' ? 'e.g., Empower Pharmacy' : 'e.g., CVS, Walgreens'}
            error={!!errors.source}
          />
          {errors.source && <span className="block text-xs text-destructive mt-1">{errors.source.message}</span>}
        </div>

        <div>
          <Label htmlFor="totalAmount" className="mb-2 block">
            Total Amount <span className="text-destructive">*</span>
          </Label>
          <Input
            type="text"
            id="totalAmount"
            {...register('totalAmount')}
            placeholder={formType === 'vial' ? 'e.g., 10mg, 20mg' : 'e.g., 2.5mg, 5mg'}
            error={!!errors.totalAmount}
          />
          {errors.totalAmount && (
            <span className="block text-xs text-destructive mt-1">{errors.totalAmount.message}</span>
          )}
        </div>

        <div>
          <Label htmlFor="status" className="mb-2 block">
            Status
          </Label>
          <Select id="status" {...register('status')}>
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
            <Input type="number" id="quantity" min={1} max={10} {...register('quantity')} />
            <p className="text-xs text-muted-foreground mt-1">Create multiple identical items</p>
          </div>
        )}
      </div>

      {formType === 'vial' && (
        <div className="mb-4">
          <Label htmlFor="beyondUseDate" className="mb-2 block">
            Beyond Use Date (BUD)
          </Label>
          <Input type="date" id="beyondUseDate" {...register('beyondUseDate')} />
          <p className="text-xs text-muted-foreground mt-1">
            Compounded vials typically have a 28-day BUD once opened. Check your pharmacy label.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !hasRequiredFields}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Add'}
        </Button>
      </div>
    </form>
  )
}
