import { PartialType } from '@nestjs/mapped-types';
import { CreatePosmAssetDto } from './create-posm-asset.dto';

export class UpdatePosmAssetDto extends PartialType(CreatePosmAssetDto) {}
