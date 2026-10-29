export interface Boundary { createdAt: string; id: string }
export interface KeysetPage { limit: number; after?: Boundary; status?: 'active' | 'inactive' }
export interface Slice<T> { items: T[]; next: Boundary | null }
