import supabase from '@/services/supabase'
import { useTelegram } from '@/services/telegram'

const { user } = useTelegram()

const MY_ID = user?.id ?? 99

export async function getOrCreateUser(telegramId) {
    if (!telegramId || Number.isNaN(Number(telegramId))) {
        throw new Error('getOrCreateUser: telegramId is required and must be a number');
    }

    const { data, error } = await supabase.rpc('get_or_create_user', { p_telegram: Number(telegramId) });

    if (error) {
        console.error('getOrCreateUser rpc error', error);
        throw error;
    }

    // supabase.rpc will return an array for set-returning functions
    if (Array.isArray(data)) return data[0] ?? null;
    return data ?? null;
}

/**
 * Register a referral using the server-side function.
 * inviterTelegram: numeric telegram id of inviter (from URL param)
 * inviterUsername: inviter's display name (optional)
 * inviteeTelegram: numeric telegram id of the new user (current user)
 * inviteeUsername: invitee display name (optional)
 */
export async function registerRef(inviterTelegram, inviterUsername, inviteeTelegram, inviteeUsername) {
    if (!inviterTelegram || !inviteeTelegram) {
        console.warn('registerRef: missing inviter or invitee id', inviterTelegram, inviteeTelegram);
        return;
    }

    const { data, error } = await supabase.rpc('register_ref', {
        inviter_telegram: Number(inviterTelegram),
        inviter_username: inviterUsername ?? 'Anonymous',
        invitee_telegram: Number(inviteeTelegram),
        invitee_username: inviteeUsername ?? 'Anonymous'
    });

    if (error) {
        console.error('register_ref rpc error', error);
        throw error;
    }

    return data;
}

/** other helper functions you had (points, bets summary) — adapt to use dynamic telegram when needed **/
export async function getUsersPoints(telegramId) {
    if (!telegramId) return null;
    const { data, error } = await supabase
        .from('users')
        .select('points')
        .eq('telegram', Number(telegramId))
        .single();

    if (error) {
        console.error('Error fetching points:', error);
        return null;
    }

    return data.points;
}

export async function getUsersBetsSummary() {
    const { data, error } = await supabase
        .from('users')
        .select('placed_bets')
        .eq('telegram', MY_ID)
        .single();

    if (error) {
        console.error('Error fetching placed_bets:', error);
        return null;
    }

    /** @type {{ side: string, stake: number }[]} */
    const bets = data.placed_bets;

    const countBets = bets.length;
    const totalVolume = bets.reduce((sum, b) => sum + (b.stake || 0), 0);

    return { countBets, totalVolume };
}


export async function getUsersWonBetsCount() {
    const { data, error } = await supabase
        .from('users')
        .select('bets_won')
        .eq('telegram', MY_ID)
        .single();

    if (error) {
        console.error('Error fetching points:', error);
        return null;
    }

    return data.bets_won;
}

export async function getLastWithdrawalTime() {
    const { data, error } = await supabase
        .from('users')
        .select('last_withdrawal_request')
        .eq('telegram', MY_ID)
        .single();

    if (error) {
        console.error('Error fetching withdrawal time:', error);
        return null;
    }

    return data.last_withdrawal_request;
}

/**
 * Fetch users by telegram ids (batch).
 * telegrams: number[] or string[] (will be normalized to numbers)
 * returns: array of rows (may be empty)
 */
export async function getUsersByTelegrams(telegrams = []) {
    if (!Array.isArray(telegrams) || telegrams.length === 0) {
        return [];
    }

    // normalize and dedupe
    const ids = Array.from(new Set(telegrams.map(t => Number(t)).filter(n => !Number.isNaN(n))));
    if (!ids.length) return [];

    const { data, error } = await supabase
        .from('users')
        .select('telegram, total_winnings')   // only request the column we need
        .in('telegram', ids);

    if (error) {
        console.error('getUsersByTelegrams error', error);
        return [];
    }

    return data ?? [];
}