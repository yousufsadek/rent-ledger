# دفتر الإيجارات — مخازن يوسف

الموقع: <https://yousufsadek.github.io/rent-ledger/>

## واتساب مباشر وإعلانات Meta

- **واتساب مباشر:** زر ✈️ بجانب كل مستأجر متأخر يرسل التذكير **من رقم واتساب الأعمال تبعك مباشرة**، بدون ما ينفتح واتساب. الضغطة الأولى تطلب تأكيد، والثانية ترسل.
- **إعلانات Meta:** في تبويب «التقارير» بطاقة تعرض حملاتك في Ads Manager مع الميزانية والحالة، وزر **تفعيل** يشغّل الحملة ومجموعاتها وإعلاناتها، وزر **إيقاف**.

> 🔒 مفاتيح Meta **ما بتنحط بالموقع** (الموقع عام وأي حد بيقدر يشوف كوده). بتنحط بسكربت Google خاص فيك (`meta-api.gs`)،
> والسكربت ما بيقبل إلا حسابات الدخول اللي بتسمح فيها.

### 1) من Meta (مرة واحدة)
1. ادخل <https://developers.facebook.com/apps> ← **Create app** ← نوع **Business** ← اربطه بحساب الأعمال (Business portfolio) تبعك.
2. من صفحة التطبيق أضف منتج **WhatsApp**. في **WhatsApp ← API Setup**:
   - أضف رقم واتساب الأعمال وفعّله (رقم **غير مستخدم** على تطبيق واتساب العادي، أو انقله لـ Cloud API).
   - انسخ **Phone number ID**.
   - أضف وسيلة دفع لواتساب (الرسائل المرسلة للعملاء مدفوعة حسب أسعار Meta).
3. **إعدادات الأعمال** <https://business.facebook.com/settings> ← **Users ← System users** ← Add (Admin):
   - **Assign assets**: التطبيق، حساب واتساب، والحساب الإعلاني (صلاحية كاملة).
   - **Generate new token** ← اختر التطبيق ← المدة **Never** ← الصلاحيات:
     `whatsapp_business_messaging`, `whatsapp_business_management`, `ads_management`, `ads_read` ← انسخ التوكن.
4. **WhatsApp Manager ← Message templates ← Create** (الفئة **Utility**، اللغة **English**):
   - الاسم `rent_reminder` والنص:
     `Good day, a reminder for the {{1}} rent for {{2}}. Outstanding amount: {{3}} QAR. Thank you.`
   - الاسم `lease_renewal` والنص:
     `Good day, the lease for {{1}} ends on {{2}}. Please confirm whether you wish to renew it. Thank you.`
   - انتظر الموافقة (عادة دقائق إلى ساعات).
5. رقم الحساب الإعلاني: افتح Ads Manager وانسخ الرقم بعد `act=` من الرابط.

### 2) سكربت Google (5 دقائق)
1. افتح <https://script.new> والصق محتوى `meta-api.gs` كاملًا ← احفظ 💾.
2. ⚙️ **Project Settings ← Script properties ← Add** وأضف:

   | Property | القيمة |
   |---|---|
   | `ALLOWED_EMAILS` | بريد الدخول للموقع (وبريد الوالد بفاصلة إذا بدك) |
   | `META_TOKEN` | توكن الـ System User |
   | `WA_PHONE_NUMBER_ID` | Phone number ID |
   | `AD_ACCOUNT_ID` | رقم الحساب الإعلاني |

3. **Deploy ← New deployment ← Web app** ← Execute as: **Me** · Who has access: **Anyone** ← **Deploy** ← وافق على الصلاحيات.
4. انسخ **Web app URL** (ينتهي بـ `/exec`).

### 3) في الموقع
تبويب «المستأجرون» ← بطاقة **واتساب مباشر وإعلانات Meta** ← الصق الرابط ← **ربط**.
لازم يطلع: «متصل بحساب …» و «واتساب ✓» و «الإعلانات ✓».

### ملاحظات
- رسائل واتساب لأول تواصل لازم تكون من قوالب معتمدة؛ لهيك الإرسال المباشر بيستخدم القالبين فوق.
- إذا غيّرت كود السكربت لاحقًا: **Deploy ← Manage deployments ← Edit ← New version** (الرابط بيضل نفسه).
- لإيقاف كل شي بسرعة: احذف `META_TOKEN` من Script properties، أو اضغط «إلغاء الربط» بالموقع.
