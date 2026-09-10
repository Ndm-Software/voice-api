# VOIA Backend — MVP Durumu

**Doküman amacı:** Proje yetkilileri, mevcut ekip ve projeye sonradan katılacak backend geliştiricileri için VOIA Backend'in bugüne kadar geldiği noktayı, tamamlanan MVP kapsamını, mevcut mimariyi, kalan kontrolleri ve Phase 2 kapsamını tek yerde toplamak.

**Güncel tarih:** 11 Eylül 2026

---

# 1. Proje Özeti

VOIA Backend; kullanıcıların hatırlatıcı oluşturabildiği, bu hatırlatıcılar için push notification ve voice call planlayabildiği, tekrar kuralları, timezone ve sessiz saatleri dikkate alarak bildirimleri zamanlayan backend servisidir.

Ana teknoloji yapısı:

- NestJS 11
- TypeScript
- PostgreSQL
- Prisma
- Redis
- Bull / delayed jobs
- JWT / Passport
- Firebase Admin SDK
- Twilio Programmable Voice
- Amazon Polly
- Luxon
- Jest

Temel çalışma akışı:

```text
User
  ↓
Reminder
  ↓
Push / Voice Settings
  ↓
Scheduler
  ↓
Bull + Redis
  ↓
Push Notification / Voice Call
  ↓
Notification History
```

---

# 2. Mevcut Durum

Backend'in **ana MVP geliştirmeleri tamamlanmıştır**.

MVP kapsamında authentication, kullanıcı ve cihaz yönetimi, reminder yönetimi, recurrence, timezone, silent hours, push/voice settings, scheduler, Firebase push, Twilio voice, Polly, history, validation, güvenlik ve Swagger/OpenAPI çalışmaları tamamlanmıştır.

Son doğrulanan test durumu:

```text
Test Suites: 57 passed, 57 total
Tests:       339 passed, 339 total
```

Build de başarılıdır.

Swagger/OpenAPI:

```text
/api/docs
/api/docs-json
```

üzerinden erişilebilir durumdadır.

---

# 3. Authentication

Authentication sistemi aşağıdaki akışları kapsar:

- Kullanıcı register
- Register OTP doğrulama
- Register OTP resend
- Login
- JWT access token
- JWT refresh token
- Refresh token rotation/yenileme akışı
- Logout
- Current user bilgisi (`/auth/me`)
- Device bağlantılı authentication

JWT payload yapısında kullanıcı UUID'si `sub` üzerinden kullanılmaktadır. Gerekli durumlarda device bilgisi de authentication akışında ilişkilendirilmektedir.

Web ve mobile kullanım senaryoları dikkate alınarak access/refresh token akışı uygulanmıştır.

---

# 4. Login Güvenliği

Login endpoint'i için rate limit uygulanmıştır.

Başarısız login denemeleri:

- email
- IP

temelinde Redis üzerinden takip edilmektedir.

Belirlenen başarısız deneme sınırından sonra endpoint `429 Too Many Requests` döndürür.

Amaç brute-force login denemelerini sınırlandırmaktır.

---

# 5. OTP

OTP sistemi register ve telefon numarası değişikliği akışlarında kullanılmaktadır.

Telefon değişikliği akışı:

```text
phone-change/request
        ↓
OTP gönderimi
        ↓
phone-change/resend (gerekirse)
        ↓
phone-change/verify
        ↓
Telefon numarasının güncellenmesi
```

Telefon numarası doğrudan profil PATCH işlemi üzerinden değiştirilmemektedir.

---

# 6. User / Profile

Kullanıcı işlemleri:

- Kullanıcı bilgilerini görüntüleme
- Profil güncelleme
- Kullanıcı silme
- Current authenticated user üzerinden veri erişimi

Profil güncelleme ile telefon değişikliği birbirinden ayrılmıştır.

Telefon değişikliği OTP doğrulamasından sonra gerçekleştirilir.

---

# 7. Device Yönetimi

Device modülü:

- Device oluşturma/güncelleme
- Kullanıcının cihazlarını listeleme
- Installation ID
- Platform
- Device name
- Push token bağlantısı

gibi bilgileri yönetmektedir.

Desteklenen platform yapısı:

- WEB
- ANDROID
- IOS

Device işlemleri authenticated user kapsamında yürütülmektedir.

---

# 8. Language Yönetimi

Language verileri için:

- Listeleme
- Detay görüntüleme
- Code üzerinden sorgulama
- Create
- Update
- Delete

endpointleri bulunmaktadır.

Okuma işlemleri public olabilirken language verisini değiştiren işlemler authentication ile korunmaktadır.

Bu yapı özellikle TTS/language bilgilerinin anonim kullanıcı tarafından değiştirilmesini engellemek amacıyla uygulanmıştır.

MVP'de çalışan Polly dil kapsamı:

- Türkçe
- İngilizce

Ek diller Phase 2 kapsamındadır.

---

# 9. Reminder Yönetimi

Reminder sistemi backend'in ana domain alanıdır.

Desteklenen işlemler:

- Create
- List
- Detail
- Update
- Delete
- Status filtreleme

Reminder status yapısı:

```text
ACTIVE
COMPLETED
CANCELLED
```

Eski `isCompleted` yaklaşımı yerine status tabanlı yapı kullanılmaktadır.

---

# 10. Reminder Validation

Reminder oluşturma ve güncelleme sırasında backend tarafında iş kuralları doğrulanmaktadır.

Kontroller arasında:

- Event datetime'in gelecekte olması
- `repeatUntil` değerinin event zamanından önce olmaması
- `repeatType = NONE` iken repeatUntil kullanılmaması
- Push dakika değerlerinin negatif olmaması
- Voice dakika değerlerinin negatif olmaması

bulunmaktadır.

Böylece mobil taraftaki validation'a ek olarak backend son doğrulama katmanı olarak görev yapmaktadır.

---

# 11. Recurring Reminder

MVP'de temel recurrence yapısı uygulanmıştır.

Desteklenen tipler:

```text
NONE
DAILY
WEEKLY
MONTHLY
```

Ek olarak:

- `repeatUntil`
- Sonraki occurrence hesaplama
- Scheduler üzerinden sonraki occurrence'ın oluşturulması

desteklenmektedir.

MVP recurrence yapısı bilinçli olarak temel tutulmuştur.

Daha karmaşık RRULE ve exception senaryoları Phase 2'dir.

---

# 12. Push Notification Settings

Push notification ayarları reminder'a bağlı olarak yönetilmektedir.

Endpoint yapısı:

```text
POST   /api/push-notification-settings
GET    /api/push-notification-settings
GET    /api/push-notification-settings/:id
PATCH  /api/push-notification-settings/:id
DELETE /api/push-notification-settings/:id
```

Ayar işlemlerinde reminder ownership kontrolü uygulanmaktadır.

Setting değiştiğinde ilgili aktif reminder scheduler tarafında yeniden planlanmaktadır.

---

# 13. Voice Call Settings

Voice notification ayarları için ayrı CRUD yapısı bulunmaktadır.

Endpoint yapısı:

```text
POST   /api/voice-call-settings
GET    /api/voice-call-settings
GET    /api/voice-call-settings/:id
PATCH  /api/voice-call-settings/:id
DELETE /api/voice-call-settings/:id
```

Current user / reminder ownership kontrolü uygulanmaktadır.

Voice setting değiştiğinde scheduler ilgili reminder'ı yeniden planlamaktadır.

---

# 14. Scheduler

Scheduler sistemi:

- Bull
- Redis
- Delayed jobs

üzerinden çalışmaktadır.

Bir reminder için notification zamanı hesaplanır ve ilgili job Bull'a eklenir.

Scheduler aşağıdaki konuları yönetmektedir:

- Push job scheduling
- Voice job scheduling
- Silent hours
- Timezone
- Recurrence
- Reschedule
- Job cancellation
- Retry
- Hata durumunda rollback/telafi

Scheduler, sistemin kritik bileşenlerinden biridir.

---

# 15. Timezone

Kullanıcının timezone bilgisi IANA timezone formatında tutulur/doğrulanır.

Timezone hesaplamalarında Luxon kullanılmaktadır.

Timezone değiştirildiğinde kullanıcının aktif reminder'ları yeniden planlanır.

Bu sayede daha önce Bull'a eklenmiş job'ların eski timezone hesabıyla çalışması engellenmektedir.

---

# 16. Silent Hours

Silent hours kullanıcı bildirimlerinin belirlenen sessiz saat aralığında çalışmasını engelleyecek şekilde scheduler'a entegre edilmiştir.

Silent hours:

- Create
- Update
- Delete

işlemlerini desteklemektedir.

Bu değişikliklerden sonra aktif reminder'lar yeniden planlanmaktadır.

Önemli MVP davranışı:

> Urgent reminder'lar MVP'de silent hours'ı bypass etmez.

Emergency override özelliği Phase 2'ye bırakılmıştır.

---

# 17. Push Notification

Push notification tarafında Firebase Admin SDK kullanılmaktadır.

Genel akış:

```text
Reminder
   ↓
Scheduler
   ↓
Bull Job
   ↓
Push Processor
   ↓
Firebase
   ↓
Device
```

Development/test aşamasında mock FCM kullanılabilmektedir.

Gerçek Firebase gönderimi için gerçek Firebase credentials ve geçerli FCM token gereklidir.

---

# 18. Voice Call / Twilio

Voice notification tarafında Twilio Programmable Voice kullanılmaktadır.

Genel akış:

```text
Reminder
   ↓
Scheduler
   ↓
Bull Voice Job
   ↓
Voice Processor
   ↓
Twilio
   ↓
User Phone
```

Çağrı sırasında `callSid` takip edilmektedir.

Twilio status callback endpoint'i bulunmaktadır.

Callback signature doğrulaması yapılmaktadır.

---

# 19. Voice Retry

MVP voice retry davranışı:

```text
1. çağrı
   ↓
başarısız / cevapsız
   ↓
2 dakika bekleme
   ↓
2. çağrı
```

Toplam deneme sayısı MVP'de en fazla 2'dir.

Retry akışı Twilio callback sonucu ile ilişkilidir.

Aynı callback'in tekrar işlenerek duplicate işlem oluşturmasını engellemek için idempotency kontrolü uygulanmaktadır.

---

# 20. Amazon Polly

Amazon Polly, reminder metninin voice içeriğe dönüştürülmesi için kullanılmaktadır.

MVP kapsamındaki sesler:

### Türkçe

- Voice: Burcu
- Locale: `tr-TR`
- Engine: neural
- Output: MP3

### İngilizce

- Voice: Joanna
- Locale: `en-US`
- Engine: neural
- Output: MP3

Kullanıcının language ayarına göre uygun Polly voice seçilmektedir.

Üretilen audio Twilio'nun erişebileceği güvenli media endpoint üzerinden sunulmaktadır.

---

# 21. Notification History

Notification history yapısı push ve voice bildirimlerinin sonucunu saklamak için kullanılmaktadır.

Temel bilgiler:

- Status
- Attempt
- sentAt
- errorMessage

Voice işlemlerinde çağrı denemeleri history ile ilişkilendirilmektedir.

---

# 22. DB / Bull Tutarlılığı

Reminder oluşturma akışında PostgreSQL transaction kullanılmaktadır.

Reminder, push setting ve voice setting işlemleri sırasında hata oluşması durumunda telafi mekanizmaları bulunmaktadır.

Scheduler/Bull tarafında hata oluştuğunda oluşturulan DB kayıtlarının ve yeni job bağlantılarının tutarlı kalması için rollback/compensation uygulanmaktadır.

PostgreSQL ve Redis arasında gerçek bir ortak transaction bulunmadığından uygulama seviyesinde telafi yaklaşımı kullanılmaktadır.

Daha ileri outbox/reconciliation yapısı Phase 2 kapsamında değerlendirilebilir.

---

# 23. Security

MVP kapsamında aşağıdaki güvenlik çalışmaları tamamlanmıştır:

- JWT authentication
- Protected endpoints
- Current-user ownership kontrolleri
- Language write endpoint protection
- Push setting ownership
- Voice setting ownership
- Login rate limiting
- Helmet
- Twilio callback signature validation
- UUID validation
- ValidationPipe ile whitelist / non-whitelisted field kontrolü

---

# 24. Global Validation

Global `ValidationPipe` kullanılmaktadır.

Temel davranışlar:

- `whitelist`
- `forbidNonWhitelisted`
- `transform`
- validation error response kontrolü

şeklindedir.

Böylece DTO dışında gönderilen alanlar ve geçersiz input'lar backend seviyesinde kontrol edilmektedir.

---

# 25. Swagger / OpenAPI

API dokümantasyonu için Swagger/OpenAPI entegrasyonu eklenmiştir.

Swagger UI:

```text
http://localhost:3001/api/docs
```

OpenAPI JSON:

```text
http://localhost:3001/api/docs-json
```

Swagger'da JWT Bearer authentication tanımlıdır.

Swagger entegrasyonu sonrası build ve mevcut Jest testleri başarılı olmuştur.

---

# 26. Test Altyapısı

Backend'de Jest tabanlı test altyapısı bulunmaktadır.

Testler kapsamında:

- Authentication
- Reminder
- Scheduler
- Recurrence
- Silent hours
- Timezone
- Push settings
- Voice settings
- Voice processor
- Retry
- Ownership
- Validation
- Rollback

gibi kritik akışlar test edilmektedir.

Son doğrulama:

```text
57 test suites passed
339 tests passed
```

---

# 27. MVP Kapsam Tablosu

| Alan | Durum |
|---|---|
| Register / Login | Tamamlandı |
| OTP | Tamamlandı |
| JWT / Refresh Token | Tamamlandı |
| Logout | Tamamlandı |
| User / Profile | Tamamlandı |
| Device | Tamamlandı |
| Languages | Tamamlandı |
| Reminder CRUD | Tamamlandı |
| Reminder Status | Tamamlandı |
| Reminder Validation | Tamamlandı |
| Basic Recurrence | Tamamlandı |
| Timezone | Tamamlandı |
| Silent Hours | Tamamlandı |
| Push Settings | Tamamlandı |
| Voice Settings | Tamamlandı |
| Bull / Redis Scheduler | Tamamlandı |
| Firebase Push | Entegrasyon tamamlandı |
| Twilio Voice | Entegrasyon tamamlandı |
| Twilio Callback | Tamamlandı |
| Voice Retry | Tamamlandı |
| Polly TR/EN | Tamamlandı |
| Notification History | Tamamlandı |
| Ownership / Security | Tamamlandı |
| DB / Queue rollback | Tamamlandı |
| Login Rate Limit | Tamamlandı |
| Helmet | Tamamlandı |
| Swagger / OpenAPI | Tamamlandı |
| Jest | 57 suite / 339 test başarılı |

---

# 28. MVP Sonrası Kalan Kabul / Release Kontrolleri

Bu bölüm yeni temel MVP geliştirmesi olarak değerlendirilmemelidir.

## Gerçek Firebase testi

Staging/production ortamında:

- Gerçek Firebase credentials
- Geçerli FCM token
- Gerçek cihaz

ile push gönderiminin doğrulanması gerekir.

## Gerçek Twilio + Polly testi

Uçtan uca voice kabulü için:

- Geçerli Twilio hesabı
- Twilio telefon numarası
- AWS Polly credentials
- Public HTTPS media URL
- Public HTTPS callback URL
- Gerçek telefon

ile test yapılmalıdır.

## FCM token cleanup

Geçersiz veya expired FCM tokenların sistemde nasıl temizleneceği staging üzerinde doğrulanmalıdır.

## History geliştirmeleri

Pilot hacmi büyüdüğünde:

- Pagination
- Tarih filtreleri
- Retention
- Cleanup

eklenebilir.

---

# 29. Phase 2

## Advanced Recurrence

MVP'nin temel recurrence yapısının genişletilmesi:

- RRULE
- Karmaşık tekrarlar
- Exception dates
- Skip occurrence
- Daha gelişmiş recurrence senaryoları

---

## Emergency Override

MVP'de urgent reminder silent hours'a uyar.

Phase 2:

- Emergency override
- Kullanıcı tercihi
- Kontrollü silent-hours bypass

---

## Google OAuth

- Google login
- Google register
- Account linking

---

## Polly Dil Genişletmesi

TR/EN dışındaki diller ve ilgili Polly voice seçenekleri.

Teknik planlamada yer alan ek diller Phase 2 kapsamında değerlendirilmelidir.

---

## Outbox / Reconciliation

DB ve Bull/Redis arasındaki tutarlılığın daha güçlü hale getirilmesi:

- Outbox pattern
- Reconciliation worker
- Eksik job tespiti
- Orphan job temizliği

---

## Polly Cache

TTS maliyetini azaltmak için:

- S3
- Kalıcı audio cache
- Aynı metin + dil kombinasyonunu yeniden kullanma

---

## Admin / RBAC

- Admin
- Roller
- Yetkiler
- Yönetim endpointleri
- Yönetim/monitoring işlemleri

---

## STT

- Speech-to-Text
- Sesli kullanıcı yanıtları
- Voice interaction

---

## Advanced Monitoring

Production ölçeğinde:

- Sentry
- Queue monitoring
- Metrics
- Alerting
- Gelişmiş logging

---

# 30. Yeni Backend Geliştiricisi İçin Kritik Bilgiler

### 1. Reminder değişiklikleri scheduler'ı etkiler

Reminder veya notification setting değiştirildiğinde yalnızca DB güncellemesi yapılmamalıdır.

Scheduler job'ının da güncel duruma göre yeniden planlanması gerekir.

### 2. Timezone ve Silent Hours değişiklikleri reschedule gerektirir

Bu ayarlar değiştiğinde daha önce oluşturulmuş aktif reminder job'ları eski hesapla bırakılmamalıdır.

### 3. Ownership korunmalıdır

Yeni endpointlerde current user kontrolü yapılmalı ve bir kullanıcının başka kullanıcının reminder/setting verisine erişmesi engellenmelidir.

### 4. MVP kapsamı korunmalıdır

Aşağıdaki özellikler mevcut MVP davranışı olarak kabul edilmelidir:

- Basic recurrence
- TR/EN Polly
- Silent hours
- Urgent reminder'ın silent hours'a uyması

### 5. Phase 2 özellikleri MVP'ye doğrudan eklenmemelidir

Advanced RRULE, emergency override, Google OAuth, ek Polly dilleri, STT ve admin/RBAC gibi konular ayrı geliştirme kapsamı olarak ele alınmalıdır.

### 6. Test zorunludur

Değişikliklerden sonra:

```bash
npm run build
npx jest --runInBand
```

çalıştırılmalıdır.

---

# 31. Teknik Kapsam Sınırı

Teknik planlama dokümanında bazı daha geniş production/Phase 2 teknolojileri tanımlanmıştır.

Bunların tamamı mevcut MVP'nin zorunlu parçası değildir.

Özellikle:

- Google OAuth
- 6 dil Polly
- Gelişmiş RRULE
- Emergency override
- STT
- S3 TTS cache
- Admin/RBAC
- Advanced monitoring
- Outbox/reconciliation

Phase 2 veya production ölçeği geliştirmeleri olarak ele alınmalıdır.

Mevcut çalışan MVP mimarisi bu özellikler eklenmeden önce korunmalıdır.

---

# 32. Sonuç

VOIA Backend'in ana MVP geliştirmeleri tamamlanmış durumdadır.

Mevcut backend:

- Authentication
- User / Device
- Reminder
- Recurrence
- Timezone
- Silent Hours
- Push
- Voice
- Twilio
- Polly
- Scheduler
- History
- Validation
- Security
- Swagger/OpenAPI
- Automated tests

kapsamlarını içeren çalışır bir MVP backend altyapısına sahiptir.

Bundan sonraki çalışma iki ana başlıkta ilerleyebilir:

1. **MVP release / gerçek servis kabul kontrolleri**
2. **Phase 2 özelliklerinin geliştirilmesi**
