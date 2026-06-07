import {
  IsString,
  IsOptional,
  IsDateString,
  IsUUID,
  IsArray,
  IsEnum,
  IsInt,
  IsBoolean,
  ValidateNested,
  ArrayUnique,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PromoTipe } from '../../database/entities/visit-competitor-promo.entity';
import { PosmKondisi } from '../../database/entities/visit-posm.entity';
import {
  StockCategory,
  StockLevel,
} from '../../database/entities/visit-stock-level.entity';
import {
  VisitDataSource,
  VisitTacoSkuUom,
} from '../../database/entities/visit-taco-sku.entity';
import {
  VisitDataSourceKind,
  VisitSubmissionMethod,
} from '../../database/entities/visit.entity';
import {
  SentimenPemilik,
  ProyekSkala,
} from '../../database/entities/visit-sinyal-toko.entity';

export class VisitTacoSkuInput {
  @IsUUID()
  taco_sku_id: string;

  @IsInt() @Min(0)
  harga_beli: number;

  @IsInt() @Min(0)
  harga_jual_tukang: number;

  @IsInt() @Min(0)
  terjual_qty: number;

  @IsEnum(VisitTacoSkuUom)
  uom: VisitTacoSkuUom;

  @IsInt() @Min(0)
  stok_on_hand: number;

  @IsArray() @IsString({ each: true })
  promo: string[];

  @IsEnum(VisitDataSource)
  source: VisitDataSource;
}

export class VisitStockLevelInput {
  @IsEnum(StockCategory)
  category: StockCategory;

  @IsEnum(StockLevel)
  level: StockLevel;
}

export class VisitPosmInput {
  @IsOptional() @IsUUID()
  posm_asset_id?: string;

  @IsOptional() @IsString()
  nama?: string;

  @IsOptional() @IsString()
  photo_url?: string;

  @IsEnum(PosmKondisi)
  kondisi: PosmKondisi;
}

export class VisitCompetitorSkuInput {
  @IsOptional() @IsUUID()
  competitor_sku_id?: string;

  @IsString()
  name: string;

  @IsOptional() @IsString()
  kode_sku?: string;

  @IsOptional() @IsString()
  category?: string;

  @IsInt() @Min(0)
  harga_beli: number;

  @IsInt() @Min(0)
  harga_jual_tukang: number;

  @IsInt() @Min(0)
  terjual_qty: number;

  @IsEnum(VisitTacoSkuUom)
  uom: VisitTacoSkuUom;

  @IsInt() @Min(0)
  stok_on_hand: number;

  @IsArray() @IsString({ each: true })
  promo: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  flags?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  photo_urls?: string[];

  @IsOptional() @IsString()
  deskripsi?: string;
}

export class VisitCompetitorPromoInput {
  @IsEnum(PromoTipe)
  tipe: PromoTipe;

  @IsString()
  deskripsi: string;

  @IsOptional() @IsDateString()
  tanggal_mulai?: string;

  @IsOptional() @IsDateString()
  tanggal_selesai?: string;
}

export class VisitCompetitorPosmInput {
  @IsString()
  nama: string;

  @IsOptional() @IsString()
  photo_url?: string;

  @IsEnum(PosmKondisi)
  kondisi: PosmKondisi;
}

export class VisitCompetitorInput {
  @IsUUID()
  competitor_brand_id: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => VisitCompetitorSkuInput)
  skus?: VisitCompetitorSkuInput[];

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => VisitCompetitorPromoInput)
  promos?: VisitCompetitorPromoInput[];

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => VisitCompetitorPosmInput)
  posms?: VisitCompetitorPosmInput[];
}

export class VisitBurningQuestionInput {
  @IsUUID()
  burning_question_id: string;

  @IsString()
  answer_text: string;

  @IsOptional() @IsString()
  answer_audio_url?: string;
}

export class VisitSinyalTokoInput {
  @IsEnum(SentimenPemilik)
  sentimen_pemilik: SentimenPemilik;

  @IsOptional() @IsString()
  sentimen_note?: string;

  @IsArray() @IsString({ each: true })
  demand_categories: string[];

  @IsOptional() @IsString()
  demand_detail?: string;

  @IsBoolean()
  ada_proyek: boolean;

  @IsOptional() @IsArray() @IsString({ each: true })
  proyek_tipe?: string[];

  @IsOptional() @IsEnum(ProyekSkala)
  proyek_skala?: ProyekSkala;

  @IsOptional() @IsString()
  proyek_note?: string;

  @IsOptional() @IsString()
  peluang_catatan_lain?: string;
}

export class CreateVisitDto {
  @IsUUID()
  store_id: string;

  @IsOptional() @IsDateString()
  visit_date?: string;

  @IsOptional() @IsUUID()
  visit_objective_id?: string;

  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true })
  pic_ids?: string[];

  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true })
  context_ids?: string[];

  @IsOptional() @IsString()
  notable_things?: string;

  @IsOptional() @IsString()
  notable_audio_url?: string;

  @IsOptional() @IsEnum(VisitDataSourceKind)
  data_source?: VisitDataSourceKind;

  @IsOptional() @IsString()
  data_source_note?: string;

  @IsOptional() @IsEnum(VisitSubmissionMethod)
  submission_method?: VisitSubmissionMethod;

  @IsOptional() @IsString()
  voice_recording_url?: string;

  @IsOptional() @IsString()
  voice_transcript?: string;

  @IsOptional()
  voice_ai_summary?: Record<string, any>;

  @IsOptional() @IsString()
  idempotency_key?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => VisitTacoSkuInput)
  taco_skus?: VisitTacoSkuInput[];

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => VisitStockLevelInput)
  stock_levels?: VisitStockLevelInput[];

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => VisitPosmInput)
  posms?: VisitPosmInput[];

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => VisitCompetitorInput)
  competitors?: VisitCompetitorInput[];

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => VisitBurningQuestionInput)
  burning_questions?: VisitBurningQuestionInput[];

  @IsOptional() @ValidateNested()
  @Type(() => VisitSinyalTokoInput)
  sinyal_toko?: VisitSinyalTokoInput;

  @IsOptional() @IsBoolean()
  submit?: boolean;
}
