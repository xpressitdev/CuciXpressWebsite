--
-- PostgreSQL database dump
--

\restrict Js9zXgqRikaKk9ZAyjjOobB0gxjUgHux22iDmmDxZON9raXC70ZzveiYRiZP76n

-- Dumped from database version 16.12 (9893e46)
-- Dumped by pg_dump version 16.10

-- Started on 2026-05-02 10:15:29 UTC

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 216 (class 1259 OID 24577)
-- Name: collaboration_submissions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.collaboration_submissions (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    business_type text,
    message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    is_read boolean DEFAULT false NOT NULL
);


ALTER TABLE public.collaboration_submissions OWNER TO neondb_owner;

--
-- TOC entry 215 (class 1259 OID 24576)
-- Name: collaboration_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.collaboration_submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.collaboration_submissions_id_seq OWNER TO neondb_owner;

--
-- TOC entry 3389 (class 0 OID 0)
-- Dependencies: 215
-- Name: collaboration_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.collaboration_submissions_id_seq OWNED BY public.collaboration_submissions.id;


--
-- TOC entry 222 (class 1259 OID 49153)
-- Name: customers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    car_plate text NOT NULL,
    phone text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.customers OWNER TO neondb_owner;

--
-- TOC entry 221 (class 1259 OID 49152)
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.customers_id_seq OWNER TO neondb_owner;

--
-- TOC entry 3390 (class 0 OID 0)
-- Dependencies: 221
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- TOC entry 224 (class 1259 OID 73729)
-- Name: service_history; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.service_history (
    id integer NOT NULL,
    customer_id integer,
    car_plate text NOT NULL,
    phone text,
    service_type text NOT NULL,
    branch text NOT NULL,
    amount integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    queue_position integer,
    payment_reference text,
    transaction_id text,
    check_in_time timestamp without time zone,
    completed_time timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.service_history OWNER TO neondb_owner;

--
-- TOC entry 223 (class 1259 OID 73728)
-- Name: service_history_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.service_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.service_history_id_seq OWNER TO neondb_owner;

--
-- TOC entry 3391 (class 0 OID 0)
-- Dependencies: 223
-- Name: service_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.service_history_id_seq OWNED BY public.service_history.id;


--
-- TOC entry 220 (class 1259 OID 32769)
-- Name: subscription_signups; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.subscription_signups (
    id integer NOT NULL,
    email text NOT NULL,
    is_notified boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.subscription_signups OWNER TO neondb_owner;

--
-- TOC entry 219 (class 1259 OID 32768)
-- Name: subscription_signups_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.subscription_signups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subscription_signups_id_seq OWNER TO neondb_owner;

--
-- TOC entry 3392 (class 0 OID 0)
-- Dependencies: 219
-- Name: subscription_signups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.subscription_signups_id_seq OWNED BY public.subscription_signups.id;


--
-- TOC entry 218 (class 1259 OID 24588)
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    email text,
    role text DEFAULT 'user'::text,
    app_access text[] DEFAULT '{car_wash,laundry}'::text[],
    created_at timestamp without time zone DEFAULT now(),
    last_login timestamp without time zone,
    profile_data jsonb
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- TOC entry 217 (class 1259 OID 24587)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO neondb_owner;

--
-- TOC entry 3393 (class 0 OID 0)
-- Dependencies: 217
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 3200 (class 2604 OID 24580)
-- Name: collaboration_submissions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.collaboration_submissions ALTER COLUMN id SET DEFAULT nextval('public.collaboration_submissions_id_seq'::regclass);


--
-- TOC entry 3210 (class 2604 OID 49156)
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- TOC entry 3213 (class 2604 OID 73732)
-- Name: service_history id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.service_history ALTER COLUMN id SET DEFAULT nextval('public.service_history_id_seq'::regclass);


--
-- TOC entry 3207 (class 2604 OID 32772)
-- Name: subscription_signups id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscription_signups ALTER COLUMN id SET DEFAULT nextval('public.subscription_signups_id_seq'::regclass);


--
-- TOC entry 3203 (class 2604 OID 24591)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- TOC entry 3375 (class 0 OID 24577)
-- Dependencies: 216
-- Data for Name: collaboration_submissions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.collaboration_submissions (id, name, email, phone, business_type, message, created_at, is_read) FROM stdin;
1	Awangku Aiman Harris	hakemshahbirin@gmail.com	8669378	food	vending machine	2025-07-12 07:16:27.835754	f
2	Hakem Shah	hakemshahbirin@gmail.com	8669378	food	i like to put my vending machine at your shop	2025-07-12 07:22:39.763686	f
\.


--
-- TOC entry 3381 (class 0 OID 49153)
-- Dependencies: 222
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.customers (id, car_plate, phone, created_at, updated_at) FROM stdin;
1	F3QWF	fwa	2025-08-24 05:16:09.007525	2025-08-24 05:16:09.007525
2	BAT4455	6738669378	2025-12-29 07:55:57.512347	2025-12-29 07:59:49.647
3	BAR4455	6738669378	2025-12-29 08:06:38.877326	2025-12-29 08:06:38.877326
4	BAT4545	6738669378	2025-12-29 08:07:15.124568	2025-12-29 08:07:15.124568
\.


--
-- TOC entry 3383 (class 0 OID 73729)
-- Dependencies: 224
-- Data for Name: service_history; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.service_history (id, customer_id, car_plate, phone, service_type, branch, amount, status, queue_position, payment_reference, transaction_id, check_in_time, completed_time, notes, created_at) FROM stdin;
\.


--
-- TOC entry 3379 (class 0 OID 32769)
-- Dependencies: 220
-- Data for Name: subscription_signups; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.subscription_signups (id, email, is_notified, created_at) FROM stdin;
1	hakemshahbirin@gmail.com	f	2025-07-12 08:34:31.689987
2	hakemshahbirin@live.com	f	2025-07-12 14:12:17.285575
3	naeemahmds@gmail.com	f	2025-07-28 11:42:47.190013
4	pengiranabdulhakem@gmail.com	f	2025-08-22 11:11:34.469079
\.


--
-- TOC entry 3377 (class 0 OID 24588)
-- Dependencies: 218
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, username, password, email, role, app_access, created_at, last_login, profile_data) FROM stdin;
2	testcustomer	test123	customer@test.com	customer	{car_wash,laundry}	2025-08-24 05:11:58.067453	\N	{"phone": "673 7654321", "carPlate": "BB1234"}
1	admin	Buy20sell26!!	admin@cucixpress.com	admin	{car_wash,laundry}	2025-08-24 05:11:58.067453	2025-12-29 08:12:39.032	\N
\.


--
-- TOC entry 3394 (class 0 OID 0)
-- Dependencies: 215
-- Name: collaboration_submissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.collaboration_submissions_id_seq', 2, true);


--
-- TOC entry 3395 (class 0 OID 0)
-- Dependencies: 221
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.customers_id_seq', 4, true);


--
-- TOC entry 3396 (class 0 OID 0)
-- Dependencies: 223
-- Name: service_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.service_history_id_seq', 1, false);


--
-- TOC entry 3397 (class 0 OID 0)
-- Dependencies: 219
-- Name: subscription_signups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.subscription_signups_id_seq', 4, true);


--
-- TOC entry 3398 (class 0 OID 0)
-- Dependencies: 217
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.users_id_seq', 2, true);


--
-- TOC entry 3217 (class 2606 OID 24586)
-- Name: collaboration_submissions collaboration_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.collaboration_submissions
    ADD CONSTRAINT collaboration_submissions_pkey PRIMARY KEY (id);


--
-- TOC entry 3227 (class 2606 OID 49162)
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- TOC entry 3229 (class 2606 OID 73738)
-- Name: service_history service_history_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.service_history
    ADD CONSTRAINT service_history_pkey PRIMARY KEY (id);


--
-- TOC entry 3223 (class 2606 OID 32780)
-- Name: subscription_signups subscription_signups_email_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscription_signups
    ADD CONSTRAINT subscription_signups_email_unique UNIQUE (email);


--
-- TOC entry 3225 (class 2606 OID 32778)
-- Name: subscription_signups subscription_signups_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscription_signups
    ADD CONSTRAINT subscription_signups_pkey PRIMARY KEY (id);


--
-- TOC entry 3219 (class 2606 OID 24595)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 3221 (class 2606 OID 24597)
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- TOC entry 3230 (class 2606 OID 73739)
-- Name: service_history service_history_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.service_history
    ADD CONSTRAINT service_history_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- TOC entry 2059 (class 826 OID 16392)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- TOC entry 2058 (class 826 OID 16391)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


-- Completed on 2026-05-02 10:15:32 UTC

--
-- PostgreSQL database dump complete
--

\unrestrict Js9zXgqRikaKk9ZAyjjOobB0gxjUgHux22iDmmDxZON9raXC70ZzveiYRiZP76n

