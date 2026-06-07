"use client";

import {
  createVisitContext,
  deleteVisitContext,
  getVisitContexts,
  updateVisitContext,
} from "@/lib/api";
import { DictionaryCrudPage, type DictionaryRow } from "../_components/DictionaryCrudPage";

const SEED: DictionaryRow[] = [
  { id: "k-1", name: "Ada pertemuan khusus", sort_order: 1, active: true },
  { id: "k-2", name: "Toko ramai", sort_order: 2, active: true },
  { id: "k-3", name: "Kunjungan singkat", sort_order: 3, active: true },
  { id: "k-4", name: "Pemilik tidak ada", sort_order: 4, active: true },
];

export default function VisitContextsPage() {
  return (
    <DictionaryCrudPage
      title="Konteks Kunjungan"
      description="Drives chip Konteks di S1 (02 C)"
      addLabel="+ Tambah Konteks"
      seed={SEED}
      handlers={{
        list: getVisitContexts,
        create: createVisitContext,
        update: updateVisitContext,
        remove: deleteVisitContext,
      }}
    />
  );
}
