import { useQuery } from '@tanstack/react-query';
import { statsApi } from './api';

/**
 * Une seule définition de la requête `/api/stats` pour toute la page.
 *
 * `StatsDashboard` et `BoostersSection` partagent la clé `['stats']` mais
 * avaient des options divergentes (staleTime/retry) : les deux sections
 * pouvaient afficher des états différents pour le même snapshot. Centraliser
 * la requête garantit qu'aucune section ne « décroche » pendant le chargement.
 */
export function useStatsQuery() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: statsApi.getStats,
    staleTime: 600_000,
    retry: 1,
  });
}
