/**
 * Una liquidacion de subgrupo solo consume pagos registrados en ese mismo
 * subgrupo. La vista global del grupo, en cambio, debe reflejar tambien los
 * pagos realizados dentro de cualquiera de sus subgrupos.
 */
export function settlementPaymentAppliesToScope(
  requestedSubgroupId: string | undefined,
  paymentSubgroupId: string | null,
  groupHasSubgroups: boolean,
): boolean {
  if (requestedSubgroupId !== undefined) return requestedSubgroupId === paymentSubgroupId;
  return groupHasSubgroups ? paymentSubgroupId !== null : paymentSubgroupId === null;
}
