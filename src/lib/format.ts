const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
export const formatGBP = (amount: number) => gbp.format(amount)
export const formatDate = (d: string | Date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d))
