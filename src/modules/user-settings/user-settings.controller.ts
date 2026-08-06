import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SaveUserSettingsDto } from './dto/save-user-settings.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UserSettingsService } from './user-settings.service';

type AuthenticatedRequest = Request & {
  user: {
    userId: number;
    email: string;
  };
};

@Controller('user-settings')
@UseGuards(JwtAuthGuard)
export class UserSettingsController {
  constructor(
    private readonly userSettingsService: UserSettingsService,
  ) {}

  /**
   * Giriş yapan kullanıcının ayarlarını getirir.
   */
  @Get('me')
  findMine(@Req() req: AuthenticatedRequest) {
    return this.userSettingsService.findMine(
      req.user.userId,
    );
  }

  /**
   * Ayarlar yoksa oluşturur, varsa tamamen günceller.
   */
  @Put('me')
  saveMine(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SaveUserSettingsDto,
  ) {
    return this.userSettingsService.save(
      req.user.userId,
      dto,
    );
  }

  /**
   * Yalnızca gönderilen ayarları günceller.
   */
  @Patch('me')
  updateMine(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateUserSettingsDto,
  ) {
    return this.userSettingsService.update(
      req.user.userId,
      dto,
    );
  }
}