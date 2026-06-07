"use client";

import {
  createVisitObjective,
  deleteVisitObjective,
  getVisitObjectives,
  updateVisitObjective,
} from "@/lib/api";
import { DictionaryCrudPage, type DictionaryRow } from "../_components/DictionaryCrudPage";

const SEED: DictionaryRow[] = [
  { id: "o-1", name: "Kunjungan Rutin", sort_order: 1, active: true },
  { id: "o-2", name: "Follow-up Stok", sort_order: 2, active: true },
  { id: "o-3", name: "Pengenalan Produk Baru", sort_order: 3, active: true },
  { id: "o-4", name: "Survei Harga", sort_order: 4, active: true },
  { id: "o-5", name: "Penyelesaian Komplain", sort_order: 5, active: true },
];

export default function VisitObjectivesPage() {
  return (
    <DictionaryCrudPage
      title="Tujuan Kunjungan"
      description="Drives chip Tujuan Kunjungan di S1 (02 C)"
      addLabel="+ Tambah Tujuan"
      seed={SEED}
      handlers={{
        list: getVisitObjectives,
        create: createVisitObjective,
        update: updateVisitObjective,
        remove: deleteVisitObjective,
      }}
    />
  );
}
