<template>
    <div class="menu">
        <RouterLink to="/" custom v-slot="{ isActive, navigate }">
            <div class="menu-item" @click="navigate">
                <i class="fas fa-user-tie" :class="{ active: isActive }" aria-hidden="true"></i>
                <span class="menu-label" :class="{ active: isActive }">Bets</span>
            </div>
        </RouterLink>

        <RouterLink to="/holidays" custom v-slot="{ isActive, navigate }">
            <div class="menu-item" @click="navigate">
                <i class="fas fa-calendar-days" :class="{ active: isActive }" aria-hidden="true"></i>
                <span class="menu-label" :class="{ active: isActive }">Holidays</span>
            </div>
        </RouterLink>

        <RouterLink to="/profile" custom v-slot="{ isActive, navigate }">
            <div class="menu-item" @click="navigate">
                <i class="fas fa-user" :class="{ active: isActive }" aria-hidden="true"></i>
                <span class="menu-label" :class="{ active: isActive }">Profile</span>
            </div>
        </RouterLink>
    </div>
</template>

<style scoped>
.menu {
    background: linear-gradient(to right bottom, #3d3d3d, #363636);
    display: flex;
    justify-content: space-around;
    align-items: center;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 95px;
    z-index: 3;
}

.menu-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    height: 50px;
    width: 100px;
}

.menu-item i {
    font-size: 2rem;
    color: #e1e1e1;
    transition: color 0.3s;
}

.menu-item .menu-label {
    margin-top: 6px;
    font-size: 0.8rem;
    opacity: 0.7;
    color: #bbb;
    transition: color 0.3s;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 400;
}

.menu-item i.active,
.menu-item .menu-label.active {
    color: #0098ea;
}
</style>
