import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const authCookieOptions = {
  httpOnly: true,
  secure: false,
  sameSite: 'lax',
} as const;

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
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findById(user.userId);
  }

  /**
   * Giriş yapan kullanıcının profil bilgilerini günceller.
   */
  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.userId, dto);
  }

  @Delete('me')
  async removeMe(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.usersService.remove(user.userId);

    response.clearCookie('accessToken', authCookieOptions);
    response.clearCookie('refreshToken', authCookieOptions);

    return result;
  }
}
