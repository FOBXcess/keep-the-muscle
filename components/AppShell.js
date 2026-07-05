"use client";
import { useMemo } from "react";
import { createClient } from "@/lib/supabase";
import KTMApp from "@/keep-the-muscle";

// Replaces the window.storage-backed store with Supabase.
// Keeps the same get(key)/set(key, value) interface so keep-the-muscle.jsx is unchanged.
function makeStore(supabase, userId) {
  const todayRe = /^ktm:today:(\d{4}-\d{2}-\d{2})$/;

  return {
    async get(key) {
      if (key === "ktm:profile") {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();
        if (!data) return null;
        // Map snake_case DB columns back to the camelCase shape keep-the-muscle.jsx expects
        // (mirror of the set() mapping below). Without this, fields like waterGoal come back
        // undefined on reload and tiles that compare against them never light.
        return {
          sex: data.sex,
          appetite: data.appetite,
          weightLbs: data.weight_lbs,
          heightIn: data.height_in,
          age: data.age,
          bf: data.bf,
          goalWeightLbs: data.goal_weight_lbs,
          equipment: data.equipment,
          restrictions: data.restrictions,
          calories: data.calories,
          protein: data.protein,
          carbs: data.carbs,
          fat: data.fat,
          waterGoal: data.water_goal,
          leanLbs: data.lean_lbs,
          accuracy: data.accuracy,
          belowMedicalFloor: data.below_medical_floor,
          startDate: data.start_date,
        };
      }

      const todayMatch = key.match(todayRe);
      if (todayMatch) {
        const date = todayMatch[1];
        const { data } = await supabase
          .from("daily_logs")
          .select("*")
          .eq("user_id", userId)
          .eq("date", date)
          .single();
        if (!data) return null;
        return {
          date: data.date,
          cal: data.cal,
          protein: data.protein,
          carbs: data.carbs,
          fat: data.fat,
          water: data.water,
          lifted: data.lifted,
          vitamin: data.vitamin,
          items: data.items || [],
          messages: data.messages || [],
        };
      }

      if (key === "ktm:meta") {
        const { data } = await supabase
          .from("user_meta")
          .select("*")
          .eq("user_id", userId)
          .single();
        if (!data) return null;
        return {
          streak: data.streak,
          underEatDays: data.under_eat_days,
          protectionDaysLeft: data.protection_days_left,
          trainHistory: data.train_history || [],
          waterHistory: data.water_history || [],
          vitaminHistory: data.vitamin_history || [],
          weightLogs: data.weight_logs || [],
        };
      }

      if (key === "ktm:favorites") {
        const { data } = await supabase
          .from("ktm_favorites")
          .select("data")
          .eq("user_id", userId)
          .single();
        return data?.data || null;
      }

      return null;
    },

    async set(key, value) {
      if (key === "ktm:profile") {
        if (!value) {
          await supabase.from("profiles").delete().eq("id", userId);
          return;
        }
        await supabase.from("profiles").upsert({
          id: userId,
          sex: value.sex,
          appetite: value.appetite,
          weight_lbs: value.weightLbs,
          height_in: value.heightIn,
          age: value.age,
          bf: value.bf,
          goal_weight_lbs: value.goalWeightLbs,
          equipment: value.equipment,
          restrictions: value.restrictions,
          calories: value.calories,
          protein: value.protein,
          carbs: value.carbs,
          fat: value.fat,
          water_goal: value.waterGoal,
          lean_lbs: value.leanLbs,
          accuracy: value.accuracy,
          below_medical_floor: value.belowMedicalFloor,
          start_date: value.startDate,
        });
        return;
      }

      const todayMatch = key.match(todayRe);
      if (todayMatch) {
        const date = todayMatch[1];
        await supabase.from("daily_logs").upsert({
          user_id: userId,
          date,
          cal: value.cal,
          protein: value.protein,
          carbs: value.carbs,
          fat: value.fat,
          water: value.water,
          lifted: value.lifted,
          vitamin: value.vitamin,
          items: value.items || [],
          messages: value.messages || [],
        }, { onConflict: "user_id,date" });
        return;
      }

      if (key === "ktm:meta") {
        await supabase.from("user_meta").upsert({
          user_id: userId,
          streak: value.streak,
          under_eat_days: value.underEatDays,
          protection_days_left: value.protectionDaysLeft,
          train_history: value.trainHistory || [],
          water_history: value.waterHistory || [],
          vitamin_history: value.vitaminHistory || [],
          weight_logs: value.weightLogs || [],
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        return;
      }

      if (key === "ktm:favorites") {
        await supabase.from("ktm_favorites").upsert({
          user_id: userId,
          data: value || {},
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
    },
  };
}

export default function AppShell({ userId }) {
  const supabase = createClient();
  const store = useMemo(() => makeStore(supabase, userId), [userId]);
  const onLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };
  return <KTMApp store={store} onLogout={onLogout} />;
}
