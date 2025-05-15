"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useState } from 'react';

const FormSchema = z.object({
    email: z.string().email({
        message: "Invalid email address.",
    }),
    password: z.string().min(6, {
        message: "Password must be at least 6 characters.",
    }),
});

type FormData = z.infer<typeof FormSchema>;

export default function LoginForm() {
    const router = useRouter();
    const [ message, setMessage ] = useState<string | null>(null);
    const form = useForm({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    });

    const onSubmit = async (data: FormData) => {
        const { email, password } = data;

        try {
            const response: any = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (!response.ok) {
                throw new Error('Invalid email or password');
            }

            router.replace('/');
            router.refresh();
        } catch (error: any) {
            setMessage(error.message || 'Error');
        }
    };

    return (
        <Form {...form} className="w-2/3 space-y-6">
            {message && <p className="text-red-600">{ message }</p>}
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-4"
            >
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input className="text-black" type="email" {...field} />
                            </FormControl>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                                <Input className="text-black" type="password" {...field} />
                            </FormControl>
                        </FormItem>
                    )}
                />
                <Button
                    type="submit"
                    className="bg-cyan-700 hover:bg-cyan-600 text-white"
                    disabled={form.formState.isSubmitting}
                >
                    {form.formState.isSubmitting ? "Logging in...." : "Login"}
                </Button>
            </form>
        </Form>
    );
}
