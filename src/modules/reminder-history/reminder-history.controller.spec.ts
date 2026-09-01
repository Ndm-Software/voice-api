import { ExecutionContext, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Application } from 'express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ReminderHistoryController } from './reminder-history.controller';
import { ReminderHistoryService } from './reminder-history.service';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

describe('ReminderHistoryController', () => {
  const user: AuthenticatedUser = {
    userId: '22222222-2222-4222-8222-222222222222',
  };
  let app: Application;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({
        historyId: '11111111-1111-4111-8111-111111111111',
      }),
      remove: jest.fn().mockResolvedValue({
        historyId: '11111111-1111-4111-8111-111111111111',
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ReminderHistoryController],
      providers: [
        {
          provide: ReminderHistoryService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest<RequestWithUser>();
          request.user = user;

          return true;
        },
      })
      .compile();

    const nestApp = moduleFixture.createNestApplication();
    nestApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await nestApp.init();

    app = nestApp.getHttpServer() as Application;
  });

  afterEach(async () => {
    // Temizlik işlemleri gerekirse buraya eklenebilir
  });

  it('rejects invalid UUID query values for reminder filters', async () => {
    const response = await request(app)
      .get('/reminder-history?reminderId=not-a-uuid')
      .expect(400);

    const body = response.body as { message?: unknown };
    expect(body.message).toEqual(
      expect.arrayContaining(['reminderId must be a UUID']),
    );
  });

  it('rejects invalid UUID route params for history records', async () => {
    const response = await request(app)
      .get('/reminder-history/not-a-uuid')
      .expect(400);

    const body = response.body as { message?: unknown };
    expect(JSON.stringify(body.message)).toContain('Validation failed');
  });

  it('passes valid UUID query values to the service', async () => {
    await request(app)
      .get('/reminder-history?reminderId=33333333-3333-4333-8333-333333333333')
      .expect(200);

    expect(service.findAll).toHaveBeenCalledWith(
      user.userId,
      '33333333-3333-4333-8333-333333333333',
    );
  });
});
