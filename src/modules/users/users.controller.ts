/**
 * TEMPORARY DEVELOPMENT ENDPOINTS
 *
 * Auth entegrasyonundan sonra:
 * - :userId kullanan endpointler kaldırılacak.
 * - Kullanıcı ID'si JWT üzerinden alınacak.
 * - GET /users/me
 * - PATCH /users/me
 * - DELETE /users/me
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Geçici local test endpointidir.
   * Auth tamamlandığında GET /users/me olacak.
   */
  @Get(':userId')
  findById(@Param('userId', ParseIntPipe) userId: number) {
    return this.usersService.findById(userId);
  }

  /**
   * Geçici local test endpointidir.
   * Auth tamamlandığında PATCH /users/me olacak.
   */
  @Patch(':userId')
  update(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(userId, dto);
  }

  /**
   * Geçici local test endpointidir.
   * Auth tamamlandığında DELETE /users/me olacak.
   */
  @Delete(':userId')
  remove(@Param('userId', ParseIntPipe) userId: number) {
    return this.usersService.remove(userId);
  }
}
