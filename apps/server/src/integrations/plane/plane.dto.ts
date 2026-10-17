import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { PlaneRoadmapGrouping } from './plane.types';

export class PlaneProjectDto {
  @IsString()
  @MaxLength(64)
  projectId: string;
}

export class PlaneWorkItemsDto extends PlaneProjectDto {
  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}

export class PlaneRoadmapDto extends PlaneProjectDto {
  @IsIn(['cycles', 'modules', 'workItems'])
  grouping: PlaneRoadmapGrouping;

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  current?: string;
}

export class PlaneParseUrlDto {
  @IsString()
  @MaxLength(2000)
  url: string;
}
