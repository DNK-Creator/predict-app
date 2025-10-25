import supabase from '@/services/supabase'
import { useTelegram } from '@/services/telegram'
import { useAppStore } from '@/stores/appStore'

const app = null
const { user } = useTelegram()

const MY_ID = user?.id

export async function userFirstTimeOpening(telegramId) {
    try {
        const idToCheck = telegramId ?? user?.id ?? null

        // If we don't have an id at all, treat as "unknown" -> return false (not first-time).
        // Change this to `return true` if you'd prefer to treat unknown as first-time.
        if (!idToCheck) {
            console.warn('userFirstTimeOpening called without a telegram id; returning false')
            return false
        }

        // Query the users table for any row with telegram = idToCheck
        const { data, error } = await supabase
            .from('users')
            .select('id', { count: 'exact' })
            .eq('telegram', idToCheck)
            .maybeSingle()

        if (error) {
            // Log and return false (conservative). You can throw if you want to escalate.
            console.error('userFirstTimeOpening: supabase error', error)
            return false
        }

        // If no data rows were returned -> first time
        const found = Array.isArray(data) ? data.length > 0 : Boolean(data)
        return !found
    } catch (err) {
        console.error('userFirstTimeOpening: unexpected error', err)
        return false
    }
}

export async function getOrCreateUser(languageCode = null) {
    const rpcParams = {
        p_telegram: Number(user?.id),
        p_language: languageCode ?? null,
    };

    const { data, error } = await supabase.rpc('get_or_create_user', rpcParams);

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

export async function getUsersPoints() {
    const { data, error } = await supabase
        .from('users')
        .select('points')
        .eq('telegram', user?.id)
        .single();

    return { data, error };
}

export async function getUsersBetsSummary() {
    let countBets = 0
    let totalVolume = 0
    if (!MY_ID) return { countBets, totalVolume };

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

    countBets = bets.length;
    totalVolume = bets.reduce((sum, b) => sum + (b.stake || 0), 0);

    return { countBets, totalVolume };
}


export async function getUsersWonBetsCount() {
    if (!MY_ID) return 0
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

export async function getUsersWalletAddress() {
    if (!MY_ID) return null
    const { data, error } = await supabase
        .from('users')
        .select('wallet_address')
        .eq('telegram', MY_ID)
        .single();

    if (error) {
        console.error('Error fetching wallet address: ', error);
        return null;
    }

    return data.wallet_address;
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

export async function updateUsersWallet(wallet_to_update) {
    const { data, error } = await supabase
        .from('users')
        .update({ wallet_address: wallet_to_update })
        .eq('telegram', user?.id)

    if (error) {
        console.error('Error updating wallet_address: ', error)
    }
}

export async function getGiftsPrices() {
    const { data, error } = await supabase
        .from('gift_prices')
        .select('*')

    if (error) {
        console.error('Error loading gifts: ', error)
        return []
    } else {
        return Array.isArray(data) ? data : []
    }
}

export async function getUsersInventory() {
    const { data, error } = await supabase
        .from('users')
        .select('inventory')
        .eq('telegram', user?.id)
        .single()

    if (error) {
        console.error('Error loading user inventory :', error)
        return []
    } else {
        return Array.isArray(data) ? data[0].inventory : data.inventory
    }
}

export async function isBetAvailable() {
    const { data, error } = await supabase
        .from('bets')
        .select('is_approved')
        .eq('id', numericId)
        .single()

    return { data, error }
}

export async function updateUsername(name) {
    const { error } = await supabase
        .from('users')
        .update({ username: name })
        .eq('telegram', user?.id)

    return error
}

export function subscribeToPointsChange(channelOld) {
    if (app === null) app = useAppStore()

    if (channelOld) {
        try { supabase.removeChannel(channelOld) } catch (e) { /* ignore */ }
        app._pointsChannel = null
    }

    const channel = supabase
        .channel(`points-${user?.id}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'users',
            filter: `telegram=eq.${user?.id}`,
        }, () => {
            // whenever the user's row changes, re-fetch points
            app.fetchPoints()
        })
        .subscribe()

    app._pointsChannel = channel
}

export async function getUsersLanguage() {
    const { data, error } = await supabase
        .from('users')
        .select('language')
        .eq('telegram', user?.id)
        .single()

    return { data, error }
}

export async function changeUsersLanguage(code) {
    const { error } = await supabase
        .from('users')
        .update({ language: code })
        .eq('telegram', user?.id)

    return { error }
}

export async function fetchUserReferrals() {
    const { data, error } = await supabase
        .from('users')
        .select('telegram, total_winnings')
        .eq('referred_by', user?.id)

    return { data, error }
}

export async function fetchBetsHolders(from, to) {
    const { data, error } = await supabase
        .from('bets_holders')
        .select('id, stake_with_gifts, multiplier, bet_status, gifts_bet, bet_id, bet_name, bet_name_en, username, side, created_at, photo_url')
        .eq('dont_show', false)
        .order('created_at', { ascending: false })
        .range(from, to)

    return { data, error }
}

export async function fetchAllHolidays() {
    const { data, error } = await supabase
        .from('holidays')
        .select('id, name, name_en, description, description_en, image_path, date')

    return { data, error }
}

export async function fetchUsersTransactions() {
    if (app === null) app = useAppStore()

    const { data, error } = await supabase
        .from('transactions')
        .select('uuid, amount, status, gift_url, created_at, type')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Something went wrong when fetching users transactions: ' + error)
        return
    }

    app.transactions = data
}

export async function subscribeToTransactions() {
    // Create or reuse a channel
    const channel = supabase
        .channel('transactions-' + user?.id)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'transactions',
                filter: `user_id=eq.${user?.id}`
            },
            async () => {
                await fetchUsersTransactions()
            }
        )

    // finally subscribe
    channel.subscribe()
}