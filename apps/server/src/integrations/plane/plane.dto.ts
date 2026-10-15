import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { PlaneGanttGrouping } from './plane.types';

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
  grouping: PlaneGanttGrouping;
}
