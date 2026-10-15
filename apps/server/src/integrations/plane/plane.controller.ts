import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { PlaneService } from './plane.service';
import { PlaneProjectDto, PlaneRoadmapDto, PlaneWorkItemsDto } from './plane.dto';

@UseGuards(JwtAuthGuard)
@Controller('plane')
export class PlaneController {
  constructor(private readonly planeService: PlaneService) {}

  @HttpCode(HttpStatus.OK)
  @Post('status')
  status() {
    return { configured: this.planeService.isConfigured() };
  }

  @HttpCode(HttpStatus.OK)
  @Post('projects')
  async projects(@AuthUser() user: User) {
    if (!this.planeService.isConfigured()) {
      return { configured: false, projects: [] };
    }
    return {
      configured: true,
      projects: await this.planeService.listVisibleProjects(user.email),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('work-items')
  async workItems(@AuthUser() user: User, @Body() dto: PlaneWorkItemsDto) {
    if (!this.planeService.isConfigured()) {
      return { configured: false, items: [], total: 0 };
    }
    const result = await this.planeService.listWorkItems(
      user.email,
      dto.projectId,
      dto.filters,
    );
    return { configured: true, ...result };
  }

  @HttpCode(HttpStatus.OK)
  @Post('cycles')
  async cycles(@AuthUser() user: User, @Body() dto: PlaneProjectDto) {
    return this.resource(user, dto.projectId, (email, projectId) =>
      this.planeService.listCycles(email, projectId),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('modules')
  async modules(@AuthUser() user: User, @Body() dto: PlaneProjectDto) {
    return this.resource(user, dto.projectId, (email, projectId) =>
      this.planeService.listModules(email, projectId),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('states')
  async states(@AuthUser() user: User, @Body() dto: PlaneProjectDto) {
    return this.resource(user, dto.projectId, (email, projectId) =>
      this.planeService.listStates(email, projectId),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('labels')
  async labels(@AuthUser() user: User, @Body() dto: PlaneProjectDto) {
    return this.resource(user, dto.projectId, (email, projectId) =>
      this.planeService.listLabels(email, projectId),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('members')
  async members(@AuthUser() user: User, @Body() dto: PlaneProjectDto) {
    return this.resource(user, dto.projectId, (email, projectId) =>
      this.planeService.listMembers(email, projectId),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('roadmap')
  async roadmap(@AuthUser() user: User, @Body() dto: PlaneRoadmapDto) {
    if (!this.planeService.isConfigured()) {
      return { configured: false, mermaid: '', taskCount: 0 };
    }
    const result = await this.planeService.buildRoadmap(
      user.email,
      dto.projectId,
      dto.grouping,
    );
    return { configured: true, ...result };
  }

  private async resource<T>(
    user: User,
    projectId: string,
    load: (email: string, projectId: string) => Promise<T[]>,
  ) {
    if (!this.planeService.isConfigured()) {
      return { configured: false, items: [] as T[] };
    }
    return {
      configured: true,
      items: await load(user.email, projectId),
    };
  }
}
