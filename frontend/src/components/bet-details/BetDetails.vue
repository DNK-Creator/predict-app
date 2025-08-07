<template>
    <LoaderPepe v-if="spinnerShow" />
    <div v-show="!spinnerShow" class="bet-details">
        <!-- Header -->
        <header class="header" :class="{ 'header--scrolled': scrolled }">
            <h1 class="header__text">{{ bet.name }}</h1>
            <!-- CircleGauge instead of image -->
            <CircleGauge :percent="Math.round(currentOdds * 100)" />
        </header>

        <!-- Main content -->
        <main ref="scrollArea" class="content" @scroll.passive="handleScroll">

            <!-- 🎉 Celebration Banner -->
            <div v-if="showCelebration" class="celebration-banner">
                <h2 v-if="user"> Congratulations, {{ user?.firstName }}! </h2>
                <h2 v-else> Congratulations, player! </h2>
                <p>The winnings will be added to your balance soon.</p>
            </div>

            <section class="content__chart">
                <Chart :data="history" />
            </section>

            <section class="card">
                <h2 class="card__title">Информация</h2>
                <p class="card__text">{{ bet.description }}</p>
            </section>

            <section class="grid">
                <div class="card grid__item">
                    <span>Объем ставок:</span>
                    <span>${{ volume.Yes + volume.No }}</span>
                </div>
                <div class="card grid__item">
                    <span>Дата окончания:</span>
                    <span>{{ formattedDate }}</span>
                </div>
                <div v-if="userBetAmount.stake > 0" class="card grid__item">
                    <span>Ваша ставка: </span>
                    <span> ${{ userBetAmount.stake }} на {{ userBetAmount.result }}</span>
                </div>
                <div v-else class="card grid__item">
                    <span>Вы еще не поставили ставку.</span>
                </div>
                <div class="card grid__item">
                    <span>Статус ставки: </span>
                    <span v-if="betStatus !== '000' && betStatus !== '111'">{{ betStatus }}</span>
                    <span v-else-if="betStatus === '111'">Открыта</span>
                    <span v-else>Ожидание разрешения ставки..</span>
                </div>
            </section>

            <section class="card comments">
                <h2 class="card__title">Comments</h2>
                <div v-if="canComment" class="comments__input-row">
                    <input v-model="newComment" placeholder="Add a comment" class="comments__input" />
                    <button class="comments__post" @click="postComment">Post</button>
                </div>
                <div class="comments__warning">
                    Only people who bet on the event can comment.
                </div>
                <div class="comments__list">
                    <CommentItem v-for="c in comments" :key="c.id" :comment="c" @delete-comment="handleDelete" />
                    <div ref="commentsAnchor" class="comments__anchor"></div>
                </div>
            </section>
        </main>

        <!-- Buy buttons -->
        <div v-if="betStatus !== '000'" class="footer">
            <button class="footer__yes" @click="openBetModal('Yes')">Buy Yes</button>
            <button class="footer__no" @click="openBetModal('No')">Buy No</button>
        </div>

        <ShowBetModal :visible="showBetModal" :bet="bet" :side="betSide" @close="showBetModal = false"
            @placed="onBetPlaced" />
    </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    getBetById,
    getHistory,
    postNewComment,
    getComments,
    deleteComment,
    getUserBetAmount,
    availableComments,
    computeBetStatus,
} from '@/services/bets-requests.js'
import Chart from '@/components/bet-details/BetChart.vue'
import CommentItem from '@/components/bet-details/CommentItem.vue'
import ShowBetModal from '@/components/ShowBetModal.vue'
import LoaderPepe from '../LoaderPepe.vue'
import CircleGauge from '@/components/bet-details/CircleGauge.vue'
import { format } from 'date-fns'
import { useTelegram } from '@/services/telegram'
import confetti from 'canvas-confetti'
import { v4 as uuidv4 } from 'uuid'

// declare that we expect an `id` prop (string or number)
const props = defineProps({
    id: {
        type: [String, Number],
        required: true,
    },
    // …any other props you already have…
})

const route = useRoute()
const router = useRouter()
const betId = route.params.id

const spinnerShow = ref(true)

const showCelebration = ref(false)

const bet = ref({})
const betStatus = computed(() => {
    return computeBetStatus(bet.value.close_time)
})
const history = ref([])
const comments = ref([])
const newComment = ref('')
const scrollArea = ref(null)
const commentsAnchor = ref(null)
const scrolled = ref(false)
const volume = ref(0)
const userBetAmount = ref({ stake: 0, result: "0" })
const canComment = ref(false)
const currentOdds = ref(0.5)

const showBetModal = ref(false)
const betSide = ref('Yes')

const { user } = useTelegram()

function goBack() {
    router.back()
}
function handleScroll() {
    scrolled.value = scrollArea.value.scrollTop > 20
}

const formattedDate = computed(() =>
    bet.value.date
        ? format(new Date(bet.value.date), 'LLLL d, yyyy')
        : ''
)

// confetti helper
function runConfetti() {
    // burst
    confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
    })
}

// Data loading & infinite comments
let commentsPage = 0
async function loadData() {
    bet.value = await getBetById(betId)
    volume.value = bet.value.volume
    currentOdds.value = bet.value.current_odds
    history.value = await getHistory(betId)
    comments.value = await getComments(betId, commentsPage)
    userBetAmount.value = await getUserBetAmount(betId)
    canComment.value = await availableComments(betId)


    // if bet is resolved and user won, trigger celebration
    if (bet.value.result !== 'undefined' &&
        userBetAmount.value.stake > 0 &&
        userBetAmount.value.result === bet.value.result) {
        showCelebration.value = true
        // small delay so it pops after the banner renders
        setTimeout(() => runConfetti(), 200)
    }
}

function onBetPlaced() {
    loadData()
}

onMounted(async () => {
    await loadData()
    await nextTick()
    if (scrollArea.value) {
        // scroll listener already on template, no extra addEventListener needed
        const observer = new IntersectionObserver(
            async ([entry]) => {
                if (entry.isIntersecting) {
                    await loadMoreComments()
                }
            },
            {
                root: scrollArea.value,
                rootMargin: '200px',
            }
        )
        if (commentsAnchor.value) {
            observer.observe(commentsAnchor.value)
        }
    }

    spinnerShow.value = false;
})

async function loadMoreComments() {
    commentsPage++
    const more = await getComments(betId, commentsPage)
    if (more.length) comments.value.push(...more)
}

async function postComment() {
    if (!newComment.value) return
    const commentId = uuidv4()
    await postNewComment(betId, newComment.value, commentId)

    comments.value.unshift({
        text: newComment.value,
        created_at: new Date().toISOString(),
        id: commentId,

        user_id: user?.id ?? 99,
        user: user?.firstName ?? 'Anonymous'
    })

    newComment.value = ''
}

async function handleDelete(commentId) {
    try {
        await deleteComment(commentId)
        comments.value = comments.value.filter(c => c.id !== commentId)
    } catch (err) {
        console.error(err)
    }
}

function openBetModal(side) {
    betSide.value = side
    showBetModal.value = true
}

</script>

<style lang="css" scoped>
/* Container */
.bet-details {
    display: flex;
    flex-direction: column;
    height: 100vh;
    position: relative;
}

/* Header */
.header {
    /* position: sticky; */
    display: flex;
    top: 0;
    background: #313131;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 80px;
    width: 100vw;
    gap: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.header__back {
    font-size: 28px;
    line-height: 1;
    background: none;
    border: none;
    cursor: pointer;
    color: white;
}

.header__title {
    align-items: center;
    justify-content: center;
    overflow: hidden;
    width: 100%;
}

.header__logo {
    width: 4rem;
    height: 4rem;
    border-radius: 10px;
}

.header__text {
    font-size: 1.2rem;
    margin-left: 1.5rem;
    font-weight: 600;
    white-space: nowrap;
    color: white;
    font-family: "Inter", sans-serif;
}

.header__spacer {
    width: 32px;
}

/* Main */
.content {
    flex: 1;
    padding: 16px;
    /* leave space for footer + navbar */
    padding-bottom: 180px;
}

.content__chart {
    margin: 24px 0;
}

/* Card */
.card {
    background: #313131;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.card__title {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: white;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.card__text {
    font-size: 0.95rem;
    color: #9ca3af;
    line-height: 1.5;
    font-family: "Inter", sans-serif;
    font-weight: 400;
}

/* Grid */
.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin-bottom: 16px;
}

.grid__item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-align: center;
    color: white;
    font-family: "Inter", sans-serif;
    font-size: 1rem;
    font-weight: 400;
    gap: 10px;
}

/* Comments */
.comments__input-row {
    display: flex;
    margin-bottom: 12px;
}

.comments__input {
    flex: 1;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 8px 0 0 8px;
    font-size: 0.95rem;
    font-family: "Inter", sans-serif;
    font-weight: 400;
}

.comments__post {
    padding: 10px 16px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 0 8px 8px 0;
    cursor: pointer;
}

.comments__warning {
    background: #f0f0f0;
    color: #666;
    font-size: 0.75rem;
    padding: 8px;
    border-radius: 8px;
    margin-bottom: 16px;
    text-align: center;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.comments__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.comments__anchor {
    height: 1px;
}

/* Footer */
.footer {
    position: fixed;
    bottom: 95px;
    /* height of your navbar */
    left: 0;
    right: 0;
    background: #313131;
    display: flex;
    gap: 12px;
    padding: 16px;
    box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.08);
}

.footer__yes,
.footer__no {
    flex: 1;
    padding: 14px 0;
    font-size: 1.05rem;
    font-weight: 600;
    border: none;
    border-radius: 8px;
    cursor: pointer;
}

.footer__yes {
    background: #3c884d;
    color: #ffffff;
}

.footer__no {
    background: #d04f4f;
    color: #ffffff;
}

/* 🎉 Celebration banner */
.celebration-banner {
    margin: 16px 0;
    padding: 16px;
    background: linear-gradient(135deg, #22c55e, #10b981);
    color: white;
    border-radius: 12px;
    text-align: center;
    animation: fadeInDown 0.5s ease-out;
}

.celebration-banner h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
}

.celebration-banner p {
    margin: 4px 0 0;
    font-size: 0.95rem;
}

/* small slide-down effect */
@keyframes fadeInDown {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
