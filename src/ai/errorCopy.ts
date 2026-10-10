import type { ModelErrorCode } from './provider';

export interface ErrorCopy {
  /** What happened, in a few words. */
  title: string;
  /** What the reader can do about it. */
  hint: string;
  /** Offer a button that asks again (the reader's decision, never the page's). */
  retry: boolean;
  /** Offer a button that opens the platform's permissions panel. */
  permissions?: boolean;
}

/** What the chat says for each way a call can end. `cancelled` is not an error and has no copy. */
export const ERROR_COPY: Record<Exclude<ModelErrorCode, 'cancelled' | 'tools_unavailable'>, ErrorCopy> = {
  not_granted: {
    title: 'Claude kullanımına izin verilmedi',
    hint: 'Bu sayfanın sizin Claude hesabınız üzerinden yanıt alabilmesi için izin gerekir. İzin verdikten sonra sayfayı yenileyin.',
    retry: false,
    permissions: true,
  },
  sampling_disabled: {
    title: 'Claude bu hesapta kullanılamıyor',
    hint: 'Hesabınız ya da kuruluşunuz bu özelliğe izin vermiyor. Harita ve zaman çizelgesi eskisi gibi çalışır.',
    retry: false,
  },
  rate_limited: {
    title: 'Çok sık istek gönderildi',
    hint: 'İstek sınırına ulaşıldı ya da kullanım hakkınız doldu. Biraz bekleyip yeniden deneyin.',
    retry: true,
  },
  session_expired: {
    title: 'Oturumunuzun süresi doldu',
    hint: "Claude'a yeniden giriş yapıp sayfayı yenileyin.",
    retry: false,
  },
  refused: {
    title: 'Model bu isteği yanıtlamadı',
    hint: 'İsteği değiştirerek yeniden deneyin.',
    retry: false,
  },
  empty_completion: {
    title: 'Model boş yanıt verdi',
    hint: 'Soruyu biraz değiştirip yeniden deneyin.',
    retry: true,
  },
  prompt_too_large: {
    title: 'Sohbet çok uzadı',
    hint: 'Yeni bir sohbet başlatın; önceki yazışmalar modele artık sığmıyor.',
    retry: false,
  },
  invalid_request: {
    title: 'İstek gönderilemedi',
    hint: 'Beklenmeyen bir hata oldu. Yeniden deneyebilirsiniz.',
    retry: true,
  },
  upstream_error: {
    title: 'Yanıt yarım kaldı',
    hint: 'Bağlantıda ya da hizmette bir sorun oldu. Yeniden deneyebilirsiniz.',
    retry: true,
  },
};

export function errorCopy(code: ModelErrorCode): ErrorCopy {
  if (code === 'cancelled' || code === 'tools_unavailable') return ERROR_COPY.upstream_error;
  return ERROR_COPY[code] ?? ERROR_COPY.upstream_error;
}
