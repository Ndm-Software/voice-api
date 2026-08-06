import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

type AuthenticatedRequest = Request & {
  user: {
    userId: number;
    email: string;
  };
};

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Giriş yapan kullanıcının güncel profil bilgilerini getirir.
   *
   * Kullanıcı ID'si URL'den alınmaz.
   * JwtStrategy tarafından req.user içine yerleştirilir.
   */
  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    return this.usersService.findById(req.user.userId);
  }

  /**
   * Giriş yapan kullanıcının profil bilgilerini günceller.
   */
  @Patch('me')
  updateMe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(req.user.userId, dto);
  }

  /**
   * Giriş yapan kullanıcının hesabını siler.
   */
  @Delete('me')
  removeMe(@Req() req: AuthenticatedRequest) {
    return this.usersService.remove(req.user.userId);
  }
}