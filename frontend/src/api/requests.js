import supabase from '@/services/supabase'
import { useTelegram } from '@/services/telegram'

const { user } = useTelegram()

const MY_ID = user?.id ?? 99

export async function getOrCreateUser() {
    const pontentialUser = await supabase
        .from('users')
        .select()
        .eq('telegram', MY_ID)

    if (pontentialUser.data.length !== 0) {
        return pontentialUser.data[0]
    }

    const newUser = {
        telegram: MY_ID,
        points: 0,
        wallet_address: null,
        placed_bets: [],
        bets_won: 0,
        last_withdrawal_request: null,
    }

    await supabase.from('users').insert(newUser)
    return newUser
}

export async function registerRef(userName, refId) {
    const { data } = await supabase.from('users').select().eq('telegram', +refId)

    const refUser = data[0]

    await supabase
        .from('users')
        .update({
            friends: { ...refUser.friends, [MY_ID]: userName },
            points: points.score + 1,
        })
        .eq('telegram', +refId)
}

export async function getUsersPoints() {
    const { data, error } = await supabase
        .from('users')
        .select('points')
        .eq('telegram', MY_ID)
        .single();

    if (error) {
        console.error('Error fetching points:', error);
        return null;
    }

    // data is like { points: 42 }
    return data.points;
}

export async function getUsersBetsCount() {
    const { data, error } = await supabase
        .from('users')
        .select('placed_bets')
        .eq('telegram', MY_ID)
        .single();

    if (error) {
        console.error('Error fetching points:', error);
        return null;
    }

    const countBets = data.placed_bets.length

    // data is like { points: 42 }
    return countBets;
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