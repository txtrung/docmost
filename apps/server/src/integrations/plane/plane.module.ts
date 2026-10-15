import { Module } from '@nestjs/common';
import { PlaneController } from './plane.controller';
import { PlaneService } from './plane.service';

@Module({
  controllers: [PlaneController],
  providers: [PlaneService],
  exports: [PlaneService],
})
export class PlaneModule {}
