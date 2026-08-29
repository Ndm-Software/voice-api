import { Body, Controller, Ip, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PhoneOtpDto, VerifyPhoneOtpDto } from './dto/phone-otp.dto';
import { OtpWorkflowService } from './otp-workflow.service';

@Controller('otp')
export class OtpController {
  constructor(private readonly otpWorkflowService: OtpWorkflowService) {}

  @Post('phone-change/request')
  @UseGuards(JwtAuthGuard)
  requestPhoneChange(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PhoneOtpDto,
    @Ip() ipAddress: string,
  ) {
    return this.otpWorkflowService.requestPhoneChange(
      user.userId,
      dto,
      ipAddress,
    );
  }

  @Post('phone-change/resend')
  @UseGuards(JwtAuthGuard)
  resendPhoneChange(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PhoneOtpDto,
    @Ip() ipAddress: string,
  ) {
    return this.otpWorkflowService.resendPhoneChange(
      user.userId,
      dto,
      ipAddress,
    );
  }

  @Post('phone-change/verify')
  @UseGuards(JwtAuthGuard)
  verifyPhoneChange(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyPhoneOtpDto,
  ) {
    return this.otpWorkflowService.verifyPhoneChange(user.userId, dto);
  }
}
