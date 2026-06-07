"use client";

import {
  createTerritory,
  deleteTerritory,
  getTerritories,
  updateTerritory,
} from "@/lib/api";
import { DictionaryCrudPage, type DictionaryRow } from "../_components/DictionaryCrudPage";
import { SEED_WILAYAH } from "../_components/constants";

const SEED: DictionaryRow[] = SEED_WILAYAH.map((w, i) => ({
  id: `wil-${i + 1}`,
  name: w.name,
  code: w.code,
  sort_order: i + 1,
  active: true,
}));

export default function WilayahPage() {
  return (
    <DictionaryCrudPage
      title="Wilayah / Teritori"
      description="9 wilayah default · Drives Sales Rep + Store assignment dan analitik heatmap"
      addLabel="+ Tambah Wilayah"
      showCode
      seed={SEED}
      handlers={{
        list: getTerritories,
        create: createTerritory,
        update: updateTerritory,
        remove: deleteTerritory,
      }}
    />
  );
}
