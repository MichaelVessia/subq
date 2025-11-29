export interface DataPoint {
  date: Date
  weight: number
  notes?: string | null
}

export interface InjectionPoint {
  date: Date
  weight: number
  dosage: string
  drug: string
  injectionSite?: string | null
  notes?: string | null
}

export interface WeightPointWithColor extends DataPoint {
  color: string
}
