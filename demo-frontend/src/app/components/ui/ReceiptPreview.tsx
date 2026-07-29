export type ReceiptItem = { name: string; qty: number; price: number };

type Props = {
  // Nama bisnis merchant (mis. "Kopi & Roti Nusantara") - ini yang tampil
  // sebagai header struk, BUKAN nama produk POS-nya, supaya struk yang
  // diterima pembeli mencerminkan toko tempat mereka belanja.
  merchantName: string;
  storeName: string;
  storeAddress: string;
  logoSrc?: string | null;
  invoiceNo: string;
  cashierName: string;
  items: ReceiptItem[];
  total: number;
  method: string;
  amountReceived?: number;
  change?: number;
  paidAt: string;
};

export function ReceiptPreview({ merchantName, storeName, storeAddress, logoSrc, invoiceNo, cashierName, items, total, method, amountReceived, change, paidAt }: Props) {
  return (
    <div id="print-receipt" className="mx-auto w-[280px] bg-white px-4 py-6 font-mono text-[11px] leading-relaxed text-ink shadow-sm">
      <div className="flex flex-col items-center gap-1 text-center">
        {logoSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt={merchantName} style={{ height: 26 }} className="object-contain" />
        )}
        <p className="font-display text-sm font-semibold">{merchantName}</p>
        {storeName && storeName !== merchantName && <p className="text-ink-soft">{storeName}</p>}
        <p className="text-ink-soft">{storeAddress}</p>
      </div>
      <div className="my-3 border-t border-dashed border-ink/30" />
      <div className="flex justify-between">
        <span>No: {invoiceNo}</span>
        <span>{paidAt}</span>
      </div>
      <div>Kasir: {cashierName}</div>
      <div className="my-3 border-t border-dashed border-ink/30" />
      {items.map((item, i) => (
        <div key={i} className="mb-1.5">
          <div>{item.name}</div>
          <div className="flex justify-between text-ink-soft">
            <span>{item.qty} x {item.price.toLocaleString("id-ID")}</span>
            <span>{(item.qty * item.price).toLocaleString("id-ID")}</span>
          </div>
        </div>
      ))}
      <div className="my-3 border-t border-dashed border-ink/30" />
      <div className="flex justify-between font-semibold">
        <span>TOTAL</span>
        <span>Rp {total.toLocaleString("id-ID")}</span>
      </div>
      <div className="flex justify-between text-ink-soft">
        <span>Metode</span>
        <span className="uppercase">{method}</span>
      </div>
      {amountReceived !== undefined && (
        <div className="flex justify-between text-ink-soft">
          <span>Tunai</span>
          <span>Rp {amountReceived.toLocaleString("id-ID")}</span>
        </div>
      )}
      {change !== undefined && (
        <div className="flex justify-between text-ink-soft">
          <span>Kembali</span>
          <span>Rp {change.toLocaleString("id-ID")}</span>
        </div>
      )}
      <div className="my-3 border-t border-dashed border-ink/30" />
      <p className="text-center text-ink-soft">Terima kasih atas kunjungan Anda</p>
    </div>
  );
}
